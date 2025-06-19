const TestService = require('../services/test.service');

// In-memory storage for active tests and connections
const activeTests = new Map(); // testCode -> test data
const adminConnections = new Map(); // testCode -> admin socket
const participantConnections = new Map(); // testCode -> array of participant sockets
const activeTimeouts = new Map(); // testCode -> timeout ID to prevent conflicts

class TestSocketHandler {
    constructor(io) {
        this.io = io;
        this.setupSocketHandlers();
        
        // Cleanup interval (every 5 minutes)
        setInterval(() => {
            this.cleanupInactiveTests();
        }, 5 * 60 * 1000);
    }
    
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 Socket connected: ${socket.id}`);
            
            // ========================================
            // ADMIN EVENTS
            // ========================================
            
            // Admin joins test room - FIXED with atomic operation
            socket.on('admin:join', async (data) => {
                try {
                    const { testCode, adminId } = data;
                    
                    // Validate admin and test
                    const test = await TestService.getTestByCode(testCode);
                    
                    // Store admin connection
                    adminConnections.set(testCode, socket);
                    socket.testCode = testCode;
                    socket.role = 'admin';
                    
                    // Store admin socket ID in test using atomic operation
                    await TestService.setAdminSocketId(testCode, socket.id);
                    
                    // Join socket room
                    socket.join(`test_${testCode}`);
                    
                    // Send initial data
                    socket.emit('admin:joined', {
                        test: this.formatTestData(test),
                        waitingRoom: TestService.getWaitingRoomData(test)
                    });
                    
                    console.log(`👨‍💼 Admin joined test ${testCode}`);
                    
                } catch (error) {
                    console.error('Admin join error:', error);
                    socket.emit('error', { message: error.message });
                }
            });
            
            // Admin starts test - ALREADY USING atomic operation
            socket.on('admin:start_test', async (data) => {
                try {
                    const { testCode } = data;
                    
                    const test = await TestService.startTest(testCode, socket.id);
                    
                    // Update active tests cache
                    activeTests.set(testCode, test);
                    
                    // Notify all participants
                    this.io.to(`test_${testCode}`).emit('test:started', {
                        test: this.formatTestData(test)
                    });
                    
                    console.log(`🚀 Test ${testCode} started`);
                    
                } catch (error) {
                    console.error('Start test error:', error);
                    socket.emit('error', { message: error.message });
                }
            });
            
            // Admin starts question - FIXED to prevent duplicates
            socket.on('admin:start_question', async (data) => {
                try {
                    const { testCode, questionNumber } = data;
                    
                    // Clear any existing timeout for this test to prevent conflicts
                    if (activeTimeouts.has(testCode)) {
                        clearTimeout(activeTimeouts.get(testCode));
                        activeTimeouts.delete(testCode);
                        console.log(`🧹 Cleared existing timeout for test ${testCode}`);
                    }
                    
                    const test = await TestService.startQuestion(testCode, questionNumber, socket.id);
                    
                    // Update cache
                    activeTests.set(testCode, test);
                    
                    // Get question data
                    const question = test.quizId.questions[questionNumber];
                    const questionTime = question.answerTime || 30;
                    
                    console.log(`❓ Question ${questionNumber} started in test ${testCode} (${questionTime}s)`);
                    
                    // Notify all participants
                    this.io.to(`test_${testCode}`).emit('question:started', {
                        questionNumber,
                        question: this.formatQuestionData(question, questionNumber),
                        timeLimit: questionTime,
                        startTime: Date.now()
                    });
                    
                    // Set up auto-end question after time limit
                    const timeoutId = setTimeout(async () => {
                        try {
                            console.log(`⏰ Auto-ending question ${questionNumber} in test ${testCode}`);
                            await this.endQuestion(testCode, socket.id);
                            activeTimeouts.delete(testCode);
                        } catch (error) {
                            console.error('Auto-end question error:', error);
                            activeTimeouts.delete(testCode);
                        }
                    }, (questionTime + 1) * 1000);
                    
                    // Store timeout ID to prevent conflicts
                    activeTimeouts.set(testCode, timeoutId);
                    
                } catch (error) {
                    console.error('Start question error:', error);
                    socket.emit('error', { message: error.message });
                }
            });
            
            // Admin timeout handler - FIXED to prevent conflicts
            socket.on('admin:timeout', async (data) => {
                try {
                    const { testCode, questionNumber } = data;
                    
                    // Check if this is the current question and still active
                    const currentTest = await TestService.getTestByCode(testCode);
                    if (currentTest.currentQuestion === questionNumber && currentTest.isQuestionActive) {
                        console.log(`⏰ Manual timeout for question ${questionNumber} in test ${testCode}`);
                        await this.endQuestion(testCode, socket.id);
                    } else {
                        console.log(`⚠️ Ignored timeout for question ${questionNumber} in test ${testCode} - already ended or different question`);
                    }
                } catch (error) {
                    console.error('Admin timeout error:', error);
                }
            });
            
            // Admin requests question stats
            socket.on('admin:get_question_stats', async (data) => {
                try {
                    const { testCode, questionNumber } = data;
                    const test = await TestService.getTestByCode(testCode);
                    
                    const stats = TestService.getQuestionStats(test, questionNumber);
                    socket.emit('admin:question_stats', {
                        questionNumber,
                        stats
                    });
                    
                } catch (error) {
                    console.error('Get question stats error:', error);
                    socket.emit('error', { message: error.message });
                }
            });
            
            // Admin requests leaderboard
            socket.on('admin:get_leaderboard', async (data) => {
                try {
                    const { testCode } = data;
                    const test = await TestService.getTestByCode(testCode);
                    
                    const leaderboard = test.getLeaderboard(20);
                    
                    socket.emit('admin:leaderboard', {
                        leaderboard
                    });
                    
                } catch (error) {
                    console.error('Get leaderboard error:', error);
                    socket.emit('error', { message: error.message });
                }
            });
            
            // Admin completes test - ALREADY USING atomic operation
            socket.on('admin:complete_test', async (data) => {
                try {
                    const { testCode } = data;
                    
                    const test = await TestService.completeTest(testCode, socket.id);
                    
                    // Remove from active tests
                    activeTests.delete(testCode);
                    
                    // Notify all participants
                    this.io.to(`test_${testCode}`).emit('test:completed', {
                        finalResults: test.finalResults
                    });
                    
                    console.log(`🏁 Test ${testCode} completed`);
                    
                } catch (error) {
                    console.error('Complete test error:', error);
                    socket.emit('error', { message: error.message });
                }
            });
            
            // ========================================
            // PARTICIPANT EVENTS
            // ========================================
            
            // Participant joins test - FIXED with reconnect handling
            socket.on('participant:join', async (data) => {
                try {
                    const { testCode, participantName } = data;
                    
                    // Clean up any existing connections for this participant
                    this.cleanupParticipantConnections(testCode, participantName);
                    
                    const result = await TestService.joinTest(testCode, participantName, socket.id);
                    
                    // Store participant connection
                    if (!participantConnections.has(testCode)) {
                        participantConnections.set(testCode, []);
                    }
                    participantConnections.get(testCode).push(socket);
                    
                    socket.testCode = testCode;
                    socket.role = 'participant';
                    socket.participantName = participantName;
                    
                    // Join socket room
                    socket.join(`test_${testCode}`);
                    
                    // Send participant data
                    socket.emit('participant:joined', {
                        participant: result.participant,
                        test: this.formatTestData(result.test),
                        waitingRoom: result.waitingRoom
                    });
                    
                    // Update waiting room for admin
                    const adminSocket = adminConnections.get(testCode);
                    if (adminSocket) {
                        adminSocket.emit('admin:participant_joined', {
                            participant: result.participant,
                            waitingRoom: result.waitingRoom
                        });
                    }
                    
                    // Broadcast to other participants
                    socket.to(`test_${testCode}`).emit('participant:user_joined', {
                        participantName,
                        participantCount: result.waitingRoom.participantCount
                    });
                    
                    console.log(`👤 Participant "${participantName}" joined test ${testCode}`);
                    
                } catch (error) {
                    console.error('Participant join error:', error);
                    socket.emit('error', { message: error.message });
                }
            });
            
            // Participant submits answer - ALREADY USING atomic operation
            socket.on('participant:submit_answer', async (data) => {
                try {
                    const { testCode, questionNumber, selectedAnswer, timeRemaining } = data;
                    
                    const result = await TestService.submitAnswer(
                        testCode, 
                        socket.id, 
                        questionNumber, 
                        selectedAnswer, 
                        timeRemaining
                    );
                    
                    // Send result to participant
                    socket.emit('participant:answer_submitted', {
                        questionNumber,
                        selectedAnswer,
                        isCorrect: result.isCorrect,
                        points: result.points,
                        newScore: result.newScore
                    });
                    
                    // Update admin stats in real-time
                    const adminSocket = adminConnections.get(testCode);
                    if (adminSocket) {
                        // Get fresh stats after the answer submission
                        const test = await TestService.getTestByCode(testCode);
                        const stats = TestService.getQuestionStats(test, questionNumber);
                        
                        adminSocket.emit('admin:answer_submitted', {
                            participantName: socket.participantName,
                            questionNumber,
                            selectedAnswer,
                            stats
                        });
                    }
                    
                    console.log(`📝 Answer submitted by ${socket.participantName} in test ${testCode}`);
                    
                } catch (error) {
                    console.error('Submit answer error:', error);
                    socket.emit('error', { message: error.message });
                }
            });
            
            // Participant requests leaderboard
            socket.on('participant:get_leaderboard', async (data) => {
                try {
                    const { testCode } = data;
                    const test = await TestService.getTestByCode(testCode);
                    
                    const leaderboard = test.getLeaderboard(20);
                    
                    socket.emit('participant:leaderboard', {
                        leaderboard
                    });
                    
                } catch (error) {
                    console.error('Get participant leaderboard error:', error);
                    socket.emit('error', { message: error.message });
                }
            });
            
            // ========================================
            // COMMON EVENTS
            // ========================================
            
            // Disconnect handling - IMPROVED with timeout cleanup
            socket.on('disconnect', async () => {
                console.log(`🔌 Socket disconnected: ${socket.id}`);
                
                if (socket.testCode) {
                    if (socket.role === 'admin') {
                        adminConnections.delete(socket.testCode);
                        
                        // Clean up any active timeouts for this test
                        if (activeTimeouts.has(socket.testCode)) {
                            clearTimeout(activeTimeouts.get(socket.testCode));
                            activeTimeouts.delete(socket.testCode);
                            console.log(`🧹 Cleaned up timeout for test ${socket.testCode} - admin disconnected`);
                        }
                        
                        console.log(`👨‍💼 Admin left test ${socket.testCode}`);
                        
                        // Notify participants that admin left
                        socket.to(`test_${socket.testCode}`).emit('admin:disconnected');
                        
                    } else if (socket.role === 'participant' && socket.participantName) {
                        // Remove from participant connections
                        const participants = participantConnections.get(socket.testCode);
                        if (participants) {
                            const index = participants.indexOf(socket);
                            if (index > -1) {
                                participants.splice(index, 1);
                            }
                        }
                        
                        // Mark as inactive in database using atomic operation
                        try {
                            const success = await TestService.leaveTest(socket.testCode, socket.id);
                            
                            if (success) {
                                // Get updated waiting room data
                                const test = await TestService.getTestByCode(socket.testCode);
                                const waitingRoom = TestService.getWaitingRoomData(test);
                                
                                // Notify admin and other participants
                                const adminSocket = adminConnections.get(socket.testCode);
                                if (adminSocket) {
                                    adminSocket.emit('admin:participant_left', {
                                        participantName: socket.participantName,
                                        waitingRoom: waitingRoom
                                    });
                                }
                                
                                socket.to(`test_${socket.testCode}`).emit('participant:user_left', {
                                    participantName: socket.participantName,
                                    participantCount: waitingRoom.participantCount
                                });
                            }
                            
                        } catch (error) {
                            console.error('Leave test error:', error);
                        }
                        
                        console.log(`👤 Participant "${socket.participantName}" left test ${socket.testCode}`);
                    }
                }
            });
            
            // Ping/Pong for connection health
            socket.on('ping', () => {
                socket.emit('pong');
            });
            
            // Handle socket errors
            socket.on('error', (error) => {
                console.error(`Socket error for ${socket.id}:`, error);
            });
        });
        
        // Handle global Socket.IO errors
        this.io.engine.on('connection_error', (err) => {
            console.error('Socket.IO connection error:', err);
        });
    }
    
    // ========================================
    // HELPER METHODS - USING atomic operations
    // ========================================
    
    /**
     * Clean up existing connections for a participant name
     */
    cleanupParticipantConnections(testCode, participantName) {
        const participants = participantConnections.get(testCode);
        if (participants) {
            // Find and disconnect any existing connections with same name
            const existingConnections = participants.filter(socket => 
                socket.participantName === participantName && !socket.disconnected
            );
            
            existingConnections.forEach(socket => {
                console.log(`🧹 Cleaning up existing connection for ${participantName}`);
                socket.disconnect(true);
            });
            
            // Remove disconnected sockets
            const activeParticipants = participants.filter(socket => 
                !socket.disconnected && socket.participantName !== participantName
            );
            participantConnections.set(testCode, activeParticipants);
        }
    }
    
    async endQuestion(testCode, adminSocketId) {
        try {
            // Check if question is already ended to prevent duplicate processing
            const currentTest = await TestService.getTestByCode(testCode);
            if (!currentTest.isQuestionActive) {
                console.log(`⚠️ Question already ended in test ${testCode}, skipping`);
                return;
            }
            
            const test = await TestService.endQuestion(testCode, adminSocketId);
            
            // Clear any active timeout
            if (activeTimeouts.has(testCode)) {
                clearTimeout(activeTimeouts.get(testCode));
                activeTimeouts.delete(testCode);
            }
            
            // Update cache
            activeTests.set(testCode, test);
            
            // Get question stats
            const stats = TestService.getQuestionStats(test, test.currentQuestion);
            
            console.log(`⏹️ Question ${test.currentQuestion} ended in test ${testCode}`);
            
            // Notify all participants and admin
            this.io.to(`test_${testCode}`).emit('question:ended', {
                questionNumber: test.currentQuestion,
                stats,
                correctAnswer: test.quizId.questions[test.currentQuestion].correctAnswer
            });
            
        } catch (error) {
            console.error('End question error:', error);
            // Clean up timeout even on error
            if (activeTimeouts.has(testCode)) {
                clearTimeout(activeTimeouts.get(testCode));
                activeTimeouts.delete(testCode);
            }
        }
    }
    
    formatTestData(test) {
        return {
            testCode: test.testCode,
            status: test.status,
            mode: test.mode,
            currentQuestion: test.currentQuestion,
            isQuestionActive: test.isQuestionActive,
            participantCount: test.getActiveParticipants().length,
            maxParticipants: test.maxParticipants,
            quiz: {
                title: test.quizId.title,
                number: test.quizNumber,
                questionCount: test.quizId.questions.length
            }
        };
    }
    
    formatQuestionData(question, questionNumber) {
        return {
            number: questionNumber + 1,
            content: question.content,
            image: question.image,
            options: question.options,
            answerTime: question.answerTime || 30
        };
    }
    
    cleanupInactiveTests() {
        // Remove disconnected admin connections
        for (const [testCode, socket] of adminConnections.entries()) {
            if (socket.disconnected) {
                adminConnections.delete(testCode);
                
                // Clean up associated timeout
                if (activeTimeouts.has(testCode)) {
                    clearTimeout(activeTimeouts.get(testCode));
                    activeTimeouts.delete(testCode);
                }
                
                console.log(`🧹 Cleaned up admin connection for test ${testCode}`);
            }
        }
        
        // Remove disconnected participant connections
        for (const [testCode, participants] of participantConnections.entries()) {
            const activeParticipants = participants.filter(socket => !socket.disconnected);
            if (activeParticipants.length !== participants.length) {
                participantConnections.set(testCode, activeParticipants);
                console.log(`🧹 Cleaned up participant connections for test ${testCode}`);
            }
            
            if (activeParticipants.length === 0) {
                participantConnections.delete(testCode);
                activeTests.delete(testCode);
                
                // Clean up timeout if no participants left
                if (activeTimeouts.has(testCode)) {
                    clearTimeout(activeTimeouts.get(testCode));
                    activeTimeouts.delete(testCode);
                    console.log(`🧹 Cleaned up timeout for empty test ${testCode}`);
                }
            }
        }
    }
    
    // ========================================
    // UTILITY METHODS FOR EXTERNAL USE
    // ========================================
    
    /**
     * Broadcast message to all participants in a test
     */
    broadcastToTest(testCode, event, data) {
        this.io.to(`test_${testCode}`).emit(event, data);
    }
    
    /**
     * Send message to admin of a test
     */
    sendToAdmin(testCode, event, data) {
        const adminSocket = adminConnections.get(testCode);
        if (adminSocket && !adminSocket.disconnected) {
            adminSocket.emit(event, data);
        }
    }
    
    /**
     * Send message to all participants in a test (excluding admin)
     */
    sendToParticipants(testCode, event, data) {
        const participants = participantConnections.get(testCode) || [];
        participants.forEach(socket => {
            if (!socket.disconnected) {
                socket.emit(event, data);
            }
        });
    }
    
    /**
     * Get active connection counts for a test
     */
    getConnectionCounts(testCode) {
        const adminSocket = adminConnections.get(testCode);
        const participants = participantConnections.get(testCode) || [];
        
        return {
            adminConnected: adminSocket && !adminSocket.disconnected,
            participantCount: participants.filter(s => !s.disconnected).length,
            totalConnections: (adminSocket && !adminSocket.disconnected ? 1 : 0) + 
                            participants.filter(s => !s.disconnected).length
        };
    }
}

module.exports = TestSocketHandler;
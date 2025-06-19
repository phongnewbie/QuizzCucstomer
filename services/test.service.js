const Test = require('../models/test.model');
const Quiz = require('../models/quiz.model');
const QRCode = require('qrcode');

class TestService {
    /**
     * Create a new test session
     */
    async createTest(testData, createdBy) {
        try {
            const { quizNumber, mode, maxParticipants, scheduleSettings, roomCode } = testData;
            
            // Find quiz by number and room code
            const quiz = await Quiz.findOne({ 
                number: quizNumber, 
                roomCode: roomCode 
            });
            
            if (!quiz) {
                throw new Error(`Quiz #${quizNumber} not found in ${roomCode.toUpperCase()} department`);
            }
            
            // Validate mode compatibility
            if (quiz.mode !== mode) {
                throw new Error(`Quiz #${quizNumber} is ${quiz.mode} mode, but you selected ${mode} mode`);
            }
            
            // Validate schedule for offline mode
            if (mode === 'offline') {
                if (!scheduleSettings || !scheduleSettings.startTime || !scheduleSettings.endTime) {
                    throw new Error('Schedule settings are required for offline mode');
                }
                
                const startTime = new Date(scheduleSettings.startTime);
                const endTime = new Date(scheduleSettings.endTime);
                const now = new Date();
                
                if (startTime <= now) {
                    throw new Error('Start time must be in the future');
                }
                
                if (endTime <= startTime) {
                    throw new Error('End time must be after start time');
                }
            }
            
            // Generate unique test code
            const testCode = await Test.generateTestCode();
            
            // Create test - for offline mode, set initial status as 'active'
            const test = new Test({
                testCode,
                quizId: quiz._id,
                quizNumber: quiz.number,
                roomCode,
                mode,
                maxParticipants: Math.min(maxParticipants, 1000), // Cap at 1000
                scheduleSettings: mode === 'offline' ? scheduleSettings : null,
                status: mode === 'offline' ? 'active' : 'waiting', // NEW: Offline tests start as active
                createdBy,
                participants: []
            });
            
            await test.save();
            
            console.log(`✅ Test created: ${testCode} for Quiz #${quiz.number} (${mode} mode)`);
            
            return {
                test,
                quiz,
                joinLink: this.generateJoinLink(testCode),
                qrCode: await this.generateQRCode(testCode)
            };
            
        } catch (error) {
            console.error('Create test error:', error);
            throw error;
        }
    }
    
    /**
     * Get test by code
     */
    async getTestByCode(testCode) {
        try {
            const test = await Test.findOne({ testCode })
                .populate('quizId')
                .populate('createdBy', 'name email');
                
            if (!test) {
                throw new Error('Test not found');
            }
            
            return test;
        } catch (error) {
            console.error('Get test error:', error);
            throw error;
        }
    }
    
    /**
     * Join test as participant - FIXED validation for offline mode
     */
    async joinTest(testCode, participantName, socketId) {
        try {
            const test = await this.getTestByCode(testCode);
            
            // FIXED: Validate test availability using comprehensive check
            const validation = await this.validateParticipantCanJoin(testCode, participantName);
            if (!validation.canJoin) {
                throw new Error(validation.reason);
            }
            
            // For offline mode, allow joining even when status is 'active'
            const allowedStatuses = test.mode === 'offline' ? ['waiting', 'active'] : ['waiting'];
            
            // First, try to reactivate existing inactive participant with same name
            const reactivateResult = await Test.findOneAndUpdate(
                {
                    testCode: testCode,
                    status: { $in: allowedStatuses },
                    'participants.name': participantName,
                    'participants.isActive': false
                },
                {
                    $set: {
                        'participants.$.socketId': socketId,
                        'participants.$.isActive': true,
                        'participants.$.joinedAt': new Date()
                    }
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );
            
            if (reactivateResult) {
                const participant = reactivateResult.participants.find(p => p.name === participantName && p.isActive);
                
                return {
                    test: reactivateResult,
                    participant,
                    waitingRoom: this.getWaitingRoomData(reactivateResult)
                };
            }
            
            // If no inactive participant found, try to add new participant
            const addResult = await Test.findOneAndUpdate(
                {
                    testCode: testCode,
                    status: { $in: allowedStatuses },
                    $expr: { 
                        $and: [
                            { $lt: [{ $size: { $filter: { input: '$participants', as: 'p', cond: '$$p.isActive' } } }, '$maxParticipants'] },
                            { $not: { $in: [participantName, { $map: { input: { $filter: { input: '$participants', as: 'p', cond: '$$p.isActive' } }, as: 'ap', in: '$$ap.name' } }] } }
                        ]
                    }
                },
                {
                    $push: {
                        participants: {
                            name: participantName,
                            socketId: socketId,
                            score: 0,
                            answers: [],
                            joinedAt: new Date(),
                            isActive: true
                        }
                    }
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );
            
            if (!addResult) {
                // This should not happen if validation passed, but just in case
                throw new Error('Unable to join test. Please try again.');
            }
            
            const participant = addResult.participants[addResult.participants.length - 1];
            
            return {
                test: addResult,
                participant,
                waitingRoom: this.getWaitingRoomData(addResult)
            };
            
        } catch (error) {
            console.error('Join test error:', error);
            throw error;
        }
    }
    
    /**
     * UPDATED: Join offline test directly - Atomic operation
     */
    async joinOfflineTest(testCode, participantName) {
        try {
            // Use new thread-safe name availability check
            const nameCheck = await Test.checkNameAvailability(testCode, participantName);
            
            if (!nameCheck.available) {
                // Check if it's the same participant rejoining
                const existingParticipant = nameCheck.existingParticipant;
                if (existingParticipant.isActive) {
                    console.log(`🔄 Participant ${participantName} rejoining existing session`);
                    
                    const test = await Test.findOne({ testCode }).populate('quizId');
                    return {
                        test,
                        participant: existingParticipant,
                        isReturning: true
                    };
                } else {
                    // Reactivate inactive participant
                    const reactivatedTest = await Test.findOneAndUpdate(
                        {
                            testCode: testCode,
                            'participants.name': participantName,
                            'participants.isActive': false
                        },
                        {
                            $set: {
                                'participants.$.isActive': true,
                                'participants.$.joinedAt': new Date()
                            }
                        },
                        { new: true, populate: { path: 'quizId' } }
                    );
                    
                    if (reactivatedTest) {
                        const participant = reactivatedTest.participants.find(p => p.name === participantName);
                        return {
                            test: reactivatedTest,
                            participant,
                            isReturning: true
                        };
                    }
                }
            }
            
            // Add new participant using existing logic
            const test = await this.getTestByCode(testCode);
            
            const validation = await this.validateParticipantCanJoin(testCode, participantName);
            if (!validation.canJoin) {
                throw new Error(validation.reason);
            }
            
            const newParticipant = {
                name: participantName,
                socketId: `offline_${Date.now()}_${Math.random()}`,
                score: 0,
                answers: [],
                joinedAt: new Date(),
                isActive: true
            };
            
            const updateResult = await Test.findOneAndUpdate(
                {
                    testCode: testCode,
                    mode: 'offline',
                    status: 'active',
                    $expr: { 
                        $lt: [
                            { $size: { $filter: { input: '$participants', as: 'p', cond: '$$p.isActive' } } }, 
                            '$maxParticipants'
                        ]
                    }
                },
                {
                    $push: { participants: newParticipant },
                    $inc: { version: 1 }
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );
            
            if (!updateResult) {
                throw new Error('Cannot join test - test full or not available');
            }
            
            const addedParticipant = updateResult.participants[updateResult.participants.length - 1];
            
            return {
                test: updateResult,
                participant: addedParticipant,
                isReturning: false
            };
            
        } catch (error) {
            console.error('Join offline test error:', error);
            throw error;
        }
    }
    /**
     * Get paginated list of tests with filtering
     * @param {Object} filterCriteria - MongoDB filter criteria
     * @param {Object} options - Pagination and sorting options
     * @returns {Array} List of tests
     */
    async getTestsList(filterCriteria = {}, options = {}) {
        try {
            const {
                skip = 0,
                limit = 10,
                sort = { updatedAt: -1 }
            } = options;

            const tests = await Test.find(filterCriteria)
                .populate('quizId', 'title mode language')
                .populate('createdBy', 'name email')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean();

            return tests;
        } catch (error) {
            console.error('Error fetching tests list:', error);
            throw new Error('Failed to fetch tests list');
        }
    }

    /**
     * Get total count of tests matching filter criteria
     * @param {Object} filterCriteria - MongoDB filter criteria
     * @returns {Number} Total count
     */
    async getTestsCount(filterCriteria = {}) {
        try {
            return await Test.countDocuments(filterCriteria);
        } catch (error) {
            console.error('Error counting tests:', error);
            throw new Error('Failed to count tests');
        }
    }

    /**
     * Get test statistics for admin dashboard
     * @param {string} roomCode - Department code
     * @returns {Object} Statistics object
     */
    async getTestStatistics(roomCode) {
        try {
            const baseFilter = { roomCode };
            
            const stats = await Promise.all([
                // Total tests
                Test.countDocuments(baseFilter),
                // Completed tests
                Test.countDocuments({ ...baseFilter, status: 'completed' }),
                // Active tests
                Test.countDocuments({ ...baseFilter, status: 'active' }),
                // Online tests
                Test.countDocuments({ ...baseFilter, mode: 'online' }),
                // Offline tests
                Test.countDocuments({ ...baseFilter, mode: 'offline' }),
                // Tests created this week
                Test.countDocuments({
                    ...baseFilter,
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                })
            ]);

            return {
                total: stats[0],
                completed: stats[1],
                active: stats[2],
                online: stats[3],
                offline: stats[4],
                thisWeek: stats[5]
            };
        } catch (error) {
            console.error('Error fetching test statistics:', error);
            throw new Error('Failed to fetch test statistics');
        }
    }
    /**
     * UPDATED: Submit offline answer - Atomic operation with better error handling
     */
    async submitOfflineAnswer(testCode, participantName, questionNumber, selectedAnswer, timeRemaining) {
        try {
            // First, get test data for validation and debugging
            const test = await Test.findOne({ testCode }).populate('quizId');
            
            if (!test) {
                throw new Error('Test not found');
            }
            
            if (test.mode !== 'offline') {
                throw new Error('This method is only for offline tests');
            }
            
            // Find participant for debugging
            const participant = test.participants.find(p => 
                p.name === participantName && p.isActive
            );
            
            if (!participant) {
                console.error(`❌ Participant not found:`, {
                    searchedName: participantName,
                    availableParticipants: test.participants
                        .filter(p => p.isActive)
                        .map(p => ({ name: p.name, isActive: p.isActive }))
                });
                throw new Error(`Participant "${participantName}" not found or not active`);
            }
            
            // Check for duplicate answers
            const alreadyAnswered = participant.answers.some(a => a.questionNumber === questionNumber);
            if (alreadyAnswered) {
                console.error(`❌ Already answered:`, {
                    participantName,
                    questionNumber,
                    existingAnswers: participant.answers.map(a => a.questionNumber)
                });
                throw new Error(`Already answered question ${questionNumber}`);
            }
            
            // Validate quiz data
            const quiz = test.quizId;
            if (!quiz.questions || questionNumber >= quiz.questions.length) {
                throw new Error('Invalid question number');
            }
            
            const question = quiz.questions[questionNumber];
            const isCorrect = question.correctAnswer === selectedAnswer;
            
            // Calculate points
            const points = this.calculatePoints(selectedAnswer, timeRemaining, questionNumber, question);
            
            const answer = {
                questionNumber: questionNumber,
                selectedAnswer: selectedAnswer,
                isCorrect: isCorrect,
                answerTime: (question.answerTime || 30) - timeRemaining,
                timeRemaining: timeRemaining,
                points: points
            };
            
            // ATOMIC: Submit answer with detailed conditions
            const updateResult = await Test.findOneAndUpdate(
                {
                    testCode: testCode,
                    mode: 'offline',
                    'participants': {
                        $elemMatch: {
                            name: participantName,
                            isActive: true,
                            'answers.questionNumber': { $ne: questionNumber }
                        }
                    }
                },
                {
                    $push: { 
                        'participants.$.answers': answer 
                    },
                    $inc: { 
                        'participants.$.score': points,
                        version: 1
                    }
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );
            
            if (!updateResult) {
                // Debug why update failed
                const debugTest = await Test.findOne({ testCode }).lean();
                const debugParticipant = debugTest.participants.find(p => p.name === participantName);
                
                console.error(`❌ Update failed - Debug info:`, {
                    testCode,
                    participantName,
                    questionNumber,
                    testExists: !!debugTest,
                    testMode: debugTest?.mode,
                    participantExists: !!debugParticipant,
                    participantActive: debugParticipant?.isActive,
                    existingAnswers: debugParticipant?.answers?.map(a => a.questionNumber) || [],
                    alreadyAnswered: debugParticipant?.answers?.some(a => a.questionNumber === questionNumber)
                });
                
                throw new Error('Cannot submit answer - conditions not met (see debug info above)');
            }
            
            // Find updated participant
            const updatedParticipant = updateResult.participants.find(p => p.name === participantName);
            
            return {
                isCorrect,
                points,
                newScore: updatedParticipant.score,
                participant: {
                    name: updatedParticipant.name,
                    score: updatedParticipant.score,
                    answers: updatedParticipant.answers
                }
            };
            
        } catch (error) {
            console.error('Submit offline answer error:', error);
            throw error;
        }
    }
    /**
     * Helper method to get existing completion result
     */
    async _getExistingCompletionResult(testCode, participantName, completedAt) {
        try {
            console.log(`🔄 Getting existing completion result for ${participantName}`);
            
            const test = await Test.findOne({ testCode }).populate('quizId');
            const participant = test.participants.find(p => p.name === participantName);
            
            if (!participant || !participant.completedAt) {
                throw new Error('Participant completion state inconsistent');
            }
            
            // Get rank from final results
            const finalResult = test.finalResults?.find(r => r.name === participantName);
            const rank = finalResult?.rank || 0;
            
            const completionProgress = test.getCompletionProgress();
            
            return {
                participant: {
                    name: participant.name,
                    score: participant.score,
                    correctAnswers: participant.answers.filter(a => a.isCorrect).length,
                    totalQuestions: participant.answers.length,
                    completionTime: Math.round((participant.completedAt - participant.joinedAt) / 1000),
                    finalRank: rank
                },
                testCompleted: test.status === 'completed',
                completionProgress: completionProgress,
                ranking: {
                    participantRank: rank,
                    totalRankedParticipants: test.finalResults?.length || 0,
                    updatedLeaderboard: (test.finalResults || []).slice(0, 10)
                },
                isExistingCompletion: true
            };
            
        } catch (error) {
            console.error('Error getting existing completion result:', error.message);
            throw new Error('Failed to retrieve existing completion data');
        }
    }
    /**
     * UPDATED: Complete offline test - Atomic operation with selective finalResults update
     */
    async completeOfflineTest(testCode, participantName) {
        const requestId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        try {
            // STEP 1: Use new model method to check if completion is possible
            const test = await Test.findOne({ testCode }).populate('quizId');
            
            if (!test) {
                throw new Error('Test not found');
            }
            
            // Check if participant can complete
            const canComplete = test.canCompleteParticipant(participantName);
            if (!canComplete.canComplete) {
                if (canComplete.reason === 'Participant already completed') {
                    console.log(`ℹ️ [${requestId}] Participant already completed, returning existing result`);
                    // Return existing completion result instead of error
                    return await this._getExistingCompletionResult(testCode, participantName, canComplete.completedAt);
                }
                throw new Error(canComplete.reason);
            }
            
            console.log(`✅ [${requestId}] Participant can complete, proceeding with atomic operation`);
            
            // STEP 2: Use new safe atomic completion method
            const updatedTest = await Test.safeMarkParticipantCompleted(testCode, participantName);
            
            if (!updatedTest) {
                // Check what happened - maybe another process completed it
                const raceTest = await Test.findOne({ testCode });
                const raceParticipant = raceTest.participants.find(p => p.name === participantName);
                
                if (raceParticipant && raceParticipant.completedAt) {
                    console.log(`🏁 [${requestId}] Race condition - participant completed by another process`);
                    return await this._getExistingCompletionResult(testCode, participantName, raceParticipant.completedAt);
                }
                
                throw new Error('Failed to complete participant - atomic operation failed');
            }
            
            console.log(`⚡ [${requestId}] Atomic completion successful`);
            
            // Find the completed participant
            const completedParticipant = updatedTest.participants.find(p => 
                p.name === participantName && p.isActive && p.completedAt
            );
            
            if (!completedParticipant) {
                throw new Error('Completed participant not found after atomic update');
            }
            
            // STEP 3: Update final results
            const rankingUpdate = await this.updateParticipantInFinalResults(testCode, completedParticipant);
            
            // STEP 4: Check and complete test if all participants finished
            // const testCompleted = await Test.checkAndCompleteTest(testCode);
            
            // if (testCompleted) {
            //     console.log(`🏁 [${requestId}] All participants completed - test marked as completed`);
            // }
            
            // STEP 5: Get final stats
            const finalTest = await Test.findOne({ testCode });
            const completionProgress = finalTest.getCompletionProgress();
            
            return {
                participant: {
                    name: completedParticipant.name,
                    score: completedParticipant.score,
                    correctAnswers: completedParticipant.answers.filter(a => a.isCorrect).length,
                    totalQuestions: completedParticipant.answers.length,
                    completionTime: Math.round((completedParticipant.completedAt - completedParticipant.joinedAt) / 1000),
                    finalRank: rankingUpdate.newParticipantRank
                },
                completionProgress: completionProgress,
                ranking: {
                    participantRank: rankingUpdate.newParticipantRank,
                    totalRankedParticipants: rankingUpdate.totalParticipants,
                    updatedLeaderboard: rankingUpdate.updatedRanking.slice(0, 10)
                }
            };
            
        } catch (error) {
            console.error(`❌ [${requestId}] Complete offline test error:`, {
                testCode,
                participantName,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * NEW: Update ONLY specific participant in finalResults AND recalculate all ranks (Atomic operation)
     */
    async updateParticipantInFinalResults(testCode, completedParticipant) {
        try {
            // Calculate participant's result data
            const newParticipantResult = {
                name: completedParticipant.name,
                score: completedParticipant.score,
                correctAnswers: completedParticipant.answers.filter(a => a.isCorrect).length,
                totalQuestions: completedParticipant.answers.length,
                completionTime: Math.round((completedParticipant.completedAt - completedParticipant.joinedAt) / 1000),
                completedAt: completedParticipant.completedAt
            };
            
            // ATOMIC: Get current test state and update finalResults completely
            const currentTest = await Test.findOne({ testCode }).lean();
            const existingResults = (currentTest.finalResults || []).filter(result => 
                result.name !== completedParticipant.name // Remove existing entry if any
            );
            
            // Add new participant and recalculate ALL ranks
            const allResults = [...existingResults, newParticipantResult];
            
            // Sort by score (desc) and completion time (asc) - faster completion wins ties
            const sortedResults = allResults.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score; // Higher score wins
                }
                return new Date(a.completedAt) - new Date(b.completedAt); // Faster completion wins
            });
            
            // Assign ranks to ALL participants (handle ties properly)
            const rankedResults = [];
            let currentRank = 1;
            
            for (let i = 0; i < sortedResults.length; i++) {
                const result = sortedResults[i];
                
                // Check if this participant ties with previous one
                if (i > 0) {
                    const prevResult = sortedResults[i - 1];
                    if (result.score !== prevResult.score || 
                        new Date(result.completedAt).getTime() !== new Date(prevResult.completedAt).getTime()) {
                        currentRank = i + 1; // New rank for different score/time
                    }
                    // If same score and time, keep same rank as previous
                }
                
                rankedResults.push({
                    ...result,
                    rank: currentRank
                });
            }
            
            // ATOMIC: Update finalResults with complete new ranking
            const updateResult = await Test.updateOne(
                { testCode: testCode },
                {
                    $set: { finalResults: rankedResults },
                    $inc: { version: 1 }
                }
            );
            
            if (updateResult.modifiedCount === 0) {
                throw new Error('Failed to update finalResults - test may have been modified');
            }
            
            // Log the ranking changes
            const newParticipantRank = rankedResults.find(r => r.name === completedParticipant.name)?.rank;
            const rankingPreview = rankedResults.slice(0, 5).map(r => `${r.rank}. ${r.name} (${r.score}pts)`).join(', ');
            
            console.log(`📊 Updated finalResults for ${completedParticipant.name} in test ${testCode}`);
            console.log(`   New participant rank: ${newParticipantRank}`);
            console.log(`   Top 5 ranking: ${rankingPreview}`);
            
            // Return rank changes for potential notifications
            return {
                newParticipantRank,
                totalParticipants: rankedResults.length,
                updatedRanking: rankedResults
            };
            
        } catch (error) {
            console.error('Update participant in final results error:', error);
            throw error;
        }
    }
    
    /**
     * UPDATED: Update final results in real-time - Now more efficient for single participant updates
     */
    async updateFinalResultsRealTime(test) {
        try {
            // Get all completed participants
            const completedParticipants = test.participants.filter(p => 
                p.isActive && p.completedAt
            );
            
            if (completedParticipants.length === 0) {
                console.log('No completed participants yet, skipping finalResults update');
                return;
            }
            
            // Calculate rankings for ALL completed participants (full recalculation)
            const finalResults = completedParticipants
                .sort((a, b) => {
                    // Sort by score first (higher is better)
                    if (b.score !== a.score) {
                        return b.score - a.score;
                    }
                    // If scores are equal, sort by completion time (faster is better)
                    return new Date(a.completedAt) - new Date(b.completedAt);
                })
                .map((participant, index) => ({
                    rank: index + 1,
                    name: participant.name,
                    score: participant.score,
                    correctAnswers: participant.answers.filter(a => a.isCorrect).length,
                    totalQuestions: participant.answers.length,
                    completionTime: Math.round((participant.completedAt - participant.joinedAt) / 1000),
                    completedAt: participant.completedAt // Keep completion timestamp
                }));
            
            // ATOMIC: Update test with current final results
            await Test.updateOne(
                { testCode: test.testCode },
                {
                    $set: { finalResults: finalResults },
                    $inc: { version: 1 }
                }
            );
            
            console.log(`📊 Full recalc finalResults for test ${test.testCode}. Current rankings:`, 
                finalResults.map(r => `${r.rank}. ${r.name} (${r.score}pts)`).join(', ')
            );
            
        } catch (error) {
            console.error('Update final results real-time error:', error);
            throw error;
        }
    }
    
    /**
     * UPDATED: Update final results - Now includes both completed and in-progress participants for offline mode
     */
    async updateFinalResults(test) {
        try {
            if (test.mode === 'offline') {
                // For offline mode, use the real-time method
                return await this.updateFinalResultsRealTime(test);
            }
            
            // For online mode, keep existing logic
            const completedParticipants = test.participants.filter(p => p.completedAt);
            
            if (completedParticipants.length === 0) {
                return;
            }
            
            // Calculate final results
            const finalResults = completedParticipants
                .sort((a, b) => {
                    // Sort by score first, then by completion time (faster is better)
                    if (b.score !== a.score) {
                        return b.score - a.score;
                    }
                    return new Date(a.completedAt) - new Date(b.completedAt);
                })
                .map((participant, index) => ({
                    rank: index + 1,
                    name: participant.name,
                    score: participant.score,
                    correctAnswers: participant.answers.filter(a => a.isCorrect).length,
                    totalQuestions: participant.answers.length,
                    completionTime: Math.round((participant.completedAt - participant.joinedAt) / 1000)
                }));
            
            // Update test with final results
            test.finalResults = finalResults;
            
            // For online tests, mark as completed when results are calculated
            if (test.mode === 'online') {
                test.status = 'completed';
            }
            
            await test.save();
            
        } catch (error) {
            console.error('Update final results error:', error);
            throw error;
        }
    }
    
    /**
     * NEW: Get real-time ranking changes for offline test (useful for notifications)
     */
    async getRankingChanges(testCode, beforeUpdate, afterUpdate) {
        try {
            const changes = [];
            
            // Compare before and after rankings
            const beforeMap = new Map();
            beforeUpdate.forEach(result => {
                beforeMap.set(result.name, result.rank);
            });
            
            afterUpdate.forEach(result => {
                const oldRank = beforeMap.get(result.name);
                if (oldRank && oldRank !== result.rank) {
                    changes.push({
                        name: result.name,
                        oldRank: oldRank,
                        newRank: result.rank,
                        change: oldRank - result.rank, // Positive = moved up, negative = moved down
                        changeType: oldRank > result.rank ? 'up' : 'down'
                    });
                }
            });
            
            return changes;
            
        } catch (error) {
            console.error('Get ranking changes error:', error);
            return [];
        }
    }
    
    /**
     * NEW: Demo method to show how the ranking system works
     */
    async demonstrateRankingSystem() {
        console.log(`
    🏆 OFFLINE TEST RANKING SYSTEM - How it works:
    
    📊 When a participant completes:
    1. ⚡ ATOMIC: Mark participant as completed (prevent race conditions)
    2. 🎯 SELECTIVE: Update only that participant in finalResults  
    3. 🔄 RECALCULATE: All existing participants get new ranks
    4. 🏁 CHECK: If all completed → mark test as 'completed'
    
    🎯 Ranking Algorithm:
    - Primary: Higher Score wins
    - Tiebreaker: Faster completion time wins
    - Handle ties: Same score + same time = same rank
    
    ⚡ Performance Benefits:
    - Only 2-3 atomic operations per completion
    - No race conditions between multiple completions
    - Real-time ranking updates
    - Efficient memory usage
    
    📈 Example Scenario:
    Time 10:00 - Alice completes: 85 pts → Rank 1
    Time 10:05 - Bob completes: 90 pts → Rank 1, Alice → Rank 2  
    Time 10:10 - Carol completes: 88 pts → Rank 2, Alice → Rank 3, Bob stays Rank 1
        `);
    }
    async getRealTimeLeaderboard(testCode) {
        try {
            const test = await this.getTestByCode(testCode);
            
            if (test.mode !== 'offline') {
                throw new Error('Real-time leaderboard is only for offline tests');
            }
            
            // Get all active participants (both completed and in-progress)
            const activeParticipants = test.participants.filter(p => p.isActive);
            
            // Separate completed and in-progress participants
            const completedParticipants = activeParticipants.filter(p => p.completedAt);
            const inProgressParticipants = activeParticipants.filter(p => !p.completedAt);
            
            // Create leaderboard entries
            const leaderboard = [];
            
            // Add completed participants (sorted by final ranking)
            const completedRanked = completedParticipants
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return new Date(a.completedAt) - new Date(b.completedAt);
                })
                .map((participant, index) => ({
                    rank: index + 1,
                    name: participant.name,
                    score: participant.score,
                    correctAnswers: participant.answers.filter(a => a.isCorrect).length,
                    totalAnswers: participant.answers.length,
                    status: 'completed',
                    completedAt: participant.completedAt,
                    completionTime: Math.round((participant.completedAt - participant.joinedAt) / 1000)
                }));
            
            // Add in-progress participants (sorted by current score)
            const inProgressRanked = inProgressParticipants
                .sort((a, b) => b.score - a.score)
                .map((participant) => ({
                    rank: null, // Will be assigned after merging
                    name: participant.name,
                    score: participant.score,
                    correctAnswers: participant.answers.filter(a => a.isCorrect).length,
                    totalAnswers: participant.answers.length,
                    status: 'in-progress',
                    joinedAt: participant.joinedAt
                }));
            
            // Merge and re-rank (completed participants get priority in ties)
            const allParticipants = [...completedRanked, ...inProgressRanked]
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    if (a.status === 'completed' && b.status === 'in-progress') return -1;
                    if (a.status === 'in-progress' && b.status === 'completed') return 1;
                    return 0;
                });
            
            // Assign final ranks
            allParticipants.forEach((participant, index) => {
                participant.rank = index + 1;
            });
            
            return {
                leaderboard: allParticipants,
                stats: {
                    totalParticipants: activeParticipants.length,
                    completedCount: completedParticipants.length,
                    inProgressCount: inProgressParticipants.length,
                    completionPercentage: activeParticipants.length > 0 ? 
                        Math.round((completedParticipants.length / activeParticipants.length) * 100) : 0
                }
            };
            
        } catch (error) {
            console.error('Get real-time leaderboard error:', error);
            throw error;
        }
    }
    
    /**
     * Leave test - FIXED with atomic operation
     */
    async leaveTest(testCode, socketId) {
        try {
            const updateResult = await Test.updateOne(
                { 
                    testCode: testCode,
                    'participants.socketId': socketId 
                },
                { 
                    $set: { 'participants.$.isActive': false } 
                }
            );
            
            if (updateResult.modifiedCount > 0) {
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Leave test error:', error);
            return false;
        }
    }
    
    /**
     * Start test (admin only) - FIXED with atomic operation
     */
    async startTest(testCode, adminSocketId) {
        try {
            // First get test to verify admin
            const test = await this.getTestByCode(testCode);
            
            // Skip admin verification for offline tests
            if (test.mode === 'online') {
                // Verify admin
                if (test.adminSocketId !== adminSocketId) {
                    throw new Error('Unauthorized: Only the test creator can start the test');
                }
            }
            
            // Update test status atomically
            const updateResult = await Test.findOneAndUpdate(
                {
                    testCode: testCode,
                    status: 'waiting',
                    ...(test.mode === 'online' && { adminSocketId: adminSocketId }),
                    $expr: { $gt: [{ $size: { $filter: { input: '$participants', as: 'p', cond: '$$p.isActive' } } }, 0] }
                },
                {
                    $set: {
                        status: 'active',
                        currentQuestion: 0,
                        isQuestionActive: false
                    }
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );
            
            if (!updateResult) {
                // Get current state for specific error
                const currentTest = await Test.findOne({ testCode });
                if (!currentTest) {
                    throw new Error('Test not found');
                }
                if (currentTest.status !== 'waiting') {
                    throw new Error('Test has already started or completed');
                }
                if (currentTest.getActiveParticipants().length === 0) {
                    throw new Error('Cannot start test with no participants');
                }
                throw new Error('Failed to start test');
            }
            
            return updateResult;
        } catch (error) {
            console.error('Start test error:', error);
            throw error;
        }
    }
    
    /**
     * Start question (admin only) - FIXED with atomic operation
     */
    async startQuestion(testCode, questionNumber, adminSocketId) {
        try {
            const updateResult = await Test.findOneAndUpdate(
                {
                    testCode: testCode,
                    status: 'active',
                    adminSocketId: adminSocketId
                },
                {
                    $set: {
                        currentQuestion: questionNumber,
                        isQuestionActive: true,
                        questionStartTime: new Date()
                    }
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );
            
            if (!updateResult) {
                throw new Error('Test not found or unauthorized');
            }
            
            return updateResult;
        } catch (error) {
            console.error('Start question error:', error);
            throw error;
        }
    }
    
    /**
     * End question (admin only) - FIXED with atomic operation
     */
    async endQuestion(testCode, adminSocketId) {
        try {
            const updateResult = await Test.findOneAndUpdate(
                {
                    testCode: testCode,
                    adminSocketId: adminSocketId
                },
                {
                    $set: {
                        isQuestionActive: false
                    }
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );
            
            if (!updateResult) {
                throw new Error('Test not found or unauthorized');
            }
            
            return updateResult;
        } catch (error) {
            console.error('End question error:', error);
            throw error;
        }
    }
    
    /**
     * Submit answer (participant) - COMPLETELY FIXED with proper validation
     */
    async submitAnswer(testCode, socketId, questionNumber, selectedAnswer, timeRemaining) {
        try {
            const test = await this.getTestByCode(testCode);
            
            // Get quiz data to validate answer
            const quiz = test.quizId;
            if (!quiz.questions || questionNumber >= quiz.questions.length) {
                throw new Error('Invalid question number');
            }
            
            const question = quiz.questions[questionNumber];
            const isCorrect = question.correctAnswer === selectedAnswer;
            
            // Calculate points
            const points = this.calculatePoints(selectedAnswer, timeRemaining, questionNumber, question);
            
            const answer = {
                questionNumber: questionNumber,
                selectedAnswer: selectedAnswer,
                isCorrect: isCorrect,
                answerTime: (question.answerTime || 30) - timeRemaining,
                timeRemaining: timeRemaining,
                points: points
            };
            
            // Check current state first for better error messages
            const currentTest = await Test.findOne({ testCode }).lean();
            const participant = currentTest.participants.find(p => p.socketId === socketId);
            
            if (!participant) {
                throw new Error('Participant not found');
            }
            
            if (!participant.isActive) {
                throw new Error('Participant is not active');
            }
            
            if (currentTest.currentQuestion !== questionNumber) {
                throw new Error(`Wrong question - current is ${currentTest.currentQuestion}, submitted ${questionNumber}`);
            }
            
            if (!currentTest.isQuestionActive) {
                throw new Error('Question is not active');
            }
            
            // Check if already answered - FIXED to properly check nested array
            const alreadyAnswered = participant.answers.some(a => a.questionNumber === questionNumber);
            if (alreadyAnswered) {
                throw new Error('Already answered this question');
            }
            
            // Simple atomic update without complex conditions
            const updateResult = await Test.findOneAndUpdate(
                {
                    testCode: testCode,
                    'participants.socketId': socketId
                },
                {
                    $push: { 'participants.$.answers': answer },
                    $inc: { 'participants.$.score': points }
                },
                { new: true }
            );
            
            if (!updateResult) {
                throw new Error('Cannot submit answer - test state changed');
            }
            
            // Find updated participant
            const updatedParticipant = updateResult.participants.find(p => p.socketId === socketId);
            
            return {
                isCorrect,
                points,
                newScore: updatedParticipant.score,
                updatedAnswers: updatedParticipant.answers,
                socketId,
                participant: {
                    socketId: updatedParticipant.socketId,
                    answers: updatedParticipant.answers,
                    score: updatedParticipant.score
                }
            };
            
        } catch (error) {
            console.error('Submit answer error:', error.message);
            throw error;
        }
    }
    
    /**
     * Complete test - FIXED with atomic operation
     */
    async completeTest(testCode, adminSocketId) {
        try {
            // First get the test data to calculate final results
            const test = await this.getTestByCode(testCode);
            
            // Verify admin for online tests
            if (test.mode === 'online' && test.adminSocketId !== adminSocketId) {
                throw new Error('Unauthorized');
            }
            
            // Calculate final results
            const activeParticipants = test.getActiveParticipants();
            const finalResults = activeParticipants
                .sort((a, b) => b.score - a.score)
                .map((participant, index) => ({
                    rank: index + 1,
                    name: participant.name,
                    score: participant.score,
                    correctAnswers: participant.answers.filter(a => a.isCorrect).length,
                    totalQuestions: participant.answers.length,
                    completionTime: Math.round((new Date() - participant.joinedAt) / 1000)
                }));
            
            // Atomic update
            const updateResult = await Test.findOneAndUpdate(
                {
                    testCode: testCode,
                    ...(test.mode === 'online' && { adminSocketId: adminSocketId })
                },
                {
                    $set: {
                        status: 'completed',
                        isQuestionActive: false,
                        finalResults: finalResults
                    }
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );
            
            if (!updateResult) {
                throw new Error('Test not found or unauthorized');
            }
            
            console.log(`🏁 Test ${testCode} completed`);
            
            return updateResult;
        } catch (error) {
            console.error('Complete test error:', error);
            throw error;
        }
    }
    
    /**
     * Set admin socket ID - NEW atomic operation
     */
    async setAdminSocketId(testCode, adminSocketId) {
        try {
            const updateResult = await Test.updateOne(
                { testCode: testCode },
                { $set: { adminSocketId: adminSocketId } }
            );
            
            return updateResult.modifiedCount > 0;
        } catch (error) {
            console.error('Set admin socket ID error:', error);
            return false;
        }
    }
    
    /**
     * Helper method to calculate points
     */
    calculatePoints(selectedAnswer, timeRemaining, questionNumber, question) {
        const isCorrect = question.correctAnswer === selectedAnswer;
        if (!isCorrect) return 0;
        
        const questionTime = question.answerTime || 30;
        const timePercentage = timeRemaining / questionTime;
        
        // Base points (10) + time bonus (up to 10 more)
        return Math.round(10 + (10 * timePercentage));
    }
    
    /**
     * Get test statistics for question
     */
    getQuestionStats(test, questionNumber) {
        const participants = test.getActiveParticipants();
        const answers = participants
            .map(p => p.answers.find(a => a.questionNumber === questionNumber))
            .filter(Boolean);
            
        const stats = {
            totalAnswers: answers.length,
            totalParticipants: participants.length,
            answerDistribution: {},
            correctAnswers: 0
        };
        
        // Count answers for each option
        answers.forEach(answer => {
            stats.answerDistribution[answer.selectedAnswer] = 
                (stats.answerDistribution[answer.selectedAnswer] || 0) + 1;
                
            if (answer.isCorrect) {
                stats.correctAnswers++;
            }
        });
        
        return stats;
    }
    
    /**
     * Get waiting room data
     */
    getWaitingRoomData(test) {
        const activeParticipants = test.getActiveParticipants();
        
        return {
            testCode: test.testCode,
            status: test.status,
            participantCount: activeParticipants.length,
            maxParticipants: test.maxParticipants,
            participants: activeParticipants.slice(0, 10).map(p => ({ // First 10 only
                name: p.name,
                joinedAt: p.joinedAt,
                score: p.score || 0,
                isActive: p.isActive
            })),
            quiz: test.quizId ? {
                title: test.quizId.title,
                questionCount: test.quizId.questions ? test.quizId.questions.length : 0
            } : null
        };
    }
    
    /**
     * Generate join link
     */
    generateJoinLink(testCode) {
        const baseUrl = process.env.BASE_URL || 'http://112.213.87.91/';
        return `${baseUrl}/test/join/${testCode}`;
    }
    
    /**
     * Generate QR code
     */
    async generateQRCode(testCode) {
        try {
            const joinLink = this.generateJoinLink(testCode);
            const qrCodeDataURL = await QRCode.toDataURL(joinLink, {
                width: 200,
                margin: 2,
                color: {
                    dark: '#1f2937',
                    light: '#ffffff'
                }
            });
            return qrCodeDataURL;
        } catch (error) {
            console.error('QR code generation error:', error);
            return null;
        }
    }
    
    /**
     * Clean up expired tests
     */
    async cleanupExpiredTests() {
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            const result = await Test.deleteMany({
                $or: [
                    { status: 'completed', updatedAt: { $lt: oneDayAgo } },
                    { status: 'cancelled', updatedAt: { $lt: oneDayAgo } },
                    { 
                        mode: 'offline',
                        'scheduleSettings.endTime': { $lt: new Date() },
                        updatedAt: { $lt: oneDayAgo }
                    }
                ]
            });
            
            if (result.deletedCount > 0) {
                console.log(`🧹 Cleaned up ${result.deletedCount} expired tests`);
            }
            
            return result.deletedCount;
        } catch (error) {
            console.error('Cleanup error:', error);
            return 0;
        }
    }
    
    /**
     * Get test results - UPDATED for offline mode with atomic real-time support
     */
    async getTestResults(testCode) {
        try {
            const test = await this.getTestByCode(testCode);
            
            // For offline mode, allow viewing results even if not all participants completed
            // if (test.mode === 'online' && test.status !== 'completed') {
            //     throw new Error('Test is not completed yet');
            // }
            
            // For offline mode with real-time results
            if (test.mode === 'offline') {
                // ATOMIC: Get fresh test data and update final results if needed
                const freshTest = await Test.findOne({ testCode: testCode })
                    .populate('quizId')
                    .populate('createdBy', 'name email');
                
                // Check if we need to update finalResults (if there are completed participants not in finalResults)
                const completedParticipants = freshTest.participants.filter(p => p.isActive && p.completedAt);
                const currentFinalResults = freshTest.finalResults || [];
                
                // If there are completed participants not in finalResults, update them
                if (completedParticipants.length > currentFinalResults.length) {
                    await this.updateFinalResultsRealTime(freshTest);
                    
                    // Get updated test data
                    const updatedTest = await Test.findOne({ testCode: testCode })
                        .populate('quizId')
                        .populate('createdBy', 'name email');
                    
                    return {
                        testCode: updatedTest.testCode,
                        quiz: {
                            title: updatedTest.quizId.title,
                            number: updatedTest.quizNumber
                        },
                        mode: updatedTest.mode,
                        status: updatedTest.status,
                        completedAt: updatedTest.status === 'completed' ? updatedTest.updatedAt : null,
                        participantCount: updatedTest.participants.filter(p => p.isActive).length,
                        completedCount: completedParticipants.length,
                        results: updatedTest.finalResults || [],
                        isRealTime: true // Indicates this is real-time results
                    };
                }
                
                return {
                    testCode: freshTest.testCode,
                    quiz: {
                        title: freshTest.quizId.title,
                        number: freshTest.quizNumber
                    },
                    mode: freshTest.mode,
                    status: freshTest.status,
                    completedAt: freshTest.status === 'completed' ? freshTest.updatedAt : null,
                    participantCount: freshTest.participants.filter(p => p.isActive).length,
                    completedCount: completedParticipants.length,
                    results: freshTest.finalResults || [],
                    isRealTime: true
                };
            }
            
            // For online mode - existing logic
            if (!test.finalResults || test.finalResults.length === 0) {
                await this.updateFinalResults(test);
                const updatedTest = await this.getTestByCode(testCode);
                return {
                    testCode: updatedTest.testCode,
                    quiz: {
                        title: updatedTest.quizId.title,
                        number: updatedTest.quizNumber
                    },
                    mode: updatedTest.mode,
                    status: updatedTest.status,
                    completedAt: updatedTest.updatedAt,
                    participantCount: updatedTest.getActiveParticipants().length,
                    results: updatedTest.finalResults || []
                };
            }
            
            return {
                testCode: test.testCode,
                quiz: {
                    title: test.quizId.title,
                    number: test.quizNumber
                },
                mode: test.mode,
                status: test.status,
                completedAt: test.updatedAt,
                participantCount: test.getActiveParticipants().length,
                results: test.finalResults
            };
        } catch (error) {
            console.error('Get test results error:', error);
            throw error;
        }
    }
    
    async checkParticipantNameUniqueness(testCode, participantName) {
        try {
            const test = await this.getTestByCode(testCode);
            const trimmedName = participantName.trim();
            
            // Get active participants
            const activeParticipants = test.getActiveParticipants();
            
            // Check if name already exists (case insensitive)
            const nameExists = activeParticipants.some(p => 
                p.name.toLowerCase().trim() === trimmedName.toLowerCase()
            );
            
            return {
                isUnique: !nameExists,
                conflictingParticipant: nameExists ? 
                    activeParticipants.find(p => p.name.toLowerCase().trim() === trimmedName.toLowerCase()) : 
                    null,
                activeParticipantCount: activeParticipants.length,
                availableSlots: test.maxParticipants - activeParticipants.length
            };
            
        } catch (error) {
            console.error('Check name uniqueness error:', error);
            throw error;
        }
    }

    /**
     * Validate participant can join test - FIXED for offline mode
     */
    async validateParticipantCanJoin(testCode, participantName) {
        try {
            const test = await this.getTestByCode(testCode);
            const trimmedName = participantName.trim();
            
            // Basic validations
            if (!trimmedName || trimmedName.length < 2) {
                return {
                    canJoin: false,
                    reason: 'Name must be at least 2 characters long'
                };
            }
            
            if (trimmedName.length > 50) {
                return {
                    canJoin: false,
                    reason: 'Name is too long (maximum 50 characters)'
                };
            }
            
            // FIXED: Schedule check FIRST for offline mode (most important)
            if (test.mode === 'offline' && test.scheduleSettings) {
                const now = new Date();
                if (now < new Date(test.scheduleSettings.startTime)) {
                    return {
                        canJoin: false,
                        reason: 'Test has not started yet. Please wait for the scheduled start time.',
                        errorType: 'NOT_STARTED',
                        startTime: test.scheduleSettings.startTime
                    };
                }
                if (now > new Date(test.scheduleSettings.endTime)) {
                    return {
                        canJoin: false,
                        reason: 'Test has expired and is no longer available.',
                        errorType: 'EXPIRED'
                    };
                }
            }
            
            // Status checks - FIXED: Different logic for offline vs online
            if (test.status === 'completed') {
                return {
                    canJoin: false,
                    reason: 'Test has already completed',
                    errorType: 'COMPLETED'
                };
            }
            
            if (test.status === 'cancelled') {
                return {
                    canJoin: false,
                    reason: 'Test has been cancelled',
                    errorType: 'CANCELLED'
                };
            }
            
            // FIXED: Mode-specific status validation
            if (test.mode === 'online') {
                // Online mode: only allow joining if status is 'waiting'
                if (test.status === 'active') {
                    return {
                        canJoin: false,
                        reason: 'Test has already started and is no longer accepting new participants',
                        errorType: 'ALREADY_STARTED'
                    };
                }
                if (test.status !== 'waiting') {
                    return {
                        canJoin: false,
                        reason: 'Test is not available for joining',
                        errorType: 'NOT_AVAILABLE'
                    };
                }
            } else if (test.mode === 'offline') {
                // Offline mode: allow joining if status is 'active' (this is normal for offline)
                if (test.status !== 'active') {
                    return {
                        canJoin: false,
                        reason: 'Test is not currently available',
                        errorType: 'NOT_AVAILABLE'
                    };
                }
            }
            
            // Capacity check
            const activeParticipants = test.getActiveParticipants();
            if (activeParticipants.length >= test.maxParticipants) {
                return {
                    canJoin: false,
                    reason: 'Test is full. No more participants can join.',
                    errorType: 'FULL'
                };
            }
            
            // Name uniqueness check
            const nameCheck = await this.checkParticipantNameUniqueness(testCode, participantName);
            if (!nameCheck.isUnique) {
                return {
                    canJoin: false,
                    reason: 'This name is already taken by another participant. Please choose a different name.',
                    errorType: 'NAME_TAKEN'
                };
            }
            
            // All validations passed
            return {
                canJoin: true,
                test: {
                    testCode: test.testCode,
                    title: test.quizId.title,
                    mode: test.mode,
                    status: test.status,
                    participantCount: activeParticipants.length,
                    maxParticipants: test.maxParticipants,
                    availableSlots: test.maxParticipants - activeParticipants.length,
                    scheduleSettings: test.scheduleSettings
                },
                participant: {
                    name: trimmedName,
                    canJoin: true
                }
            };
            
        } catch (error) {
            console.error('Validate participant can join error:', error);
            return {
                canJoin: false,
                reason: 'Test not found or validation failed',
                errorType: 'VALIDATION_ERROR'
            };
        }
    }
}

module.exports = new TestService();
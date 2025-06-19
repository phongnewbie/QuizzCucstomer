const QuizService = require('../services/quiz.service');
const multer = require('multer');

// Helper function to determine quiz status
function getQuizStatus(quiz) {
    if (!quiz.scheduleSettings) {
        return 'active'; // Online quizzes are always active
    }
    
    const now = new Date();
    const startTime = new Date(quiz.scheduleSettings.startTime);
    const endTime = new Date(quiz.scheduleSettings.endTime);
    
    if (now < startTime) {
        return 'scheduled';
    } else if (now >= startTime && now <= endTime) {
        return 'active';
    } else {
        return 'expired';
    }
}

// Helper function to estimate quiz duration
function estimateQuizDuration(questions) {
    if (!questions || questions.length === 0) return '0 min';
    
    const totalSeconds = questions.reduce((sum, question) => {
        return sum + (question.answerTime || 30);
    }, 0);
    
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    } else {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }
}

// Helper function to migrate old quiz data to new format
function migrateQuizData(quiz) {
    if (!quiz.questions) return quiz;
    
    // Migrate questions to new format if needed
    quiz.questions = quiz.questions.map(question => {
        // If question has old 'type' field, remove it (we only support single choice now)
        if (question.type) {
            delete question.type;
        }
        
        // Ensure answerTime exists
        if (!question.answerTime) {
            question.answerTime = 30; // Default 30 seconds
        }
        
        // Ensure options are in new format
        if (question.options && question.options.length > 0) {
            // If options are in old format, convert them
            if (typeof question.options[0] === 'string') {
                question.options = question.options.map((text, index) => ({
                    letter: String.fromCharCode(65 + index), // A, B, C, D, etc.
                    text: text
                }));
            }
        } else {
            // Default to 2 empty options
            question.options = [
                { letter: 'A', text: '' },
                { letter: 'B', text: '' }
            ];
        }
        
        // Ensure correctAnswer is a single letter (not array)
        if (Array.isArray(question.correctAnswer)) {
            question.correctAnswer = question.correctAnswer[0] || 'A';
        } else if (!question.correctAnswer) {
            question.correctAnswer = 'A';
        }
        
        return question;
    });
    
    return quiz;
}

// Helper function to get room name
function getRoomName(roomCode) {
    const roomNames = {
        'hrm': 'Human Resource Management',
        'hse': 'Health, Safety & Environment',
        'gm': 'General Management',
        'qasx': 'Quality Assurance - Production',
        'sm': 'Sales Marketing'
    };
    return roomNames[roomCode] || roomCode.toUpperCase();
}

class QuizController {
    async createQuiz(req, res) {
        try {
            // Get roomCode from admin's selected room session
            const roomCode = req.session?.selectedRoom?.code;
            if (!roomCode) {
                return res.status(400).json({ 
                    error: req.t('auth:room_selection_required')
                });
            }

            // Add roomCode to quiz data
            const quizData = { ...req.body };
            const quizInfo = JSON.parse(quizData.quizInfo);
            quizInfo.roomCode = roomCode;
            quizData.quizInfo = JSON.stringify(quizInfo);

            // Use QuizService with translation function
            const quiz = await QuizService.createQuiz(quizData, req.files, req.t);
            
            console.log(`✅ Quiz "${quiz.title}" (Number: ${quiz.number}) created for ${roomCode.toUpperCase()} department by ${req.session.user.email}`);
            
            res.status(201).json(quiz);
        } catch (error) {
            console.error('Create quiz error:', error);
            res.status(500).json({ 
                error: error.message || req.t('quiz:create_quiz_error')
            });
        }
    }

    async getQuiz(req, res) {
        try {
            // Use QuizService with translation function
            let quiz = await QuizService.getQuiz(req.params.id, req.t);
            
            // Check room access permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && quiz.roomCode && quiz.roomCode !== userRoomCode) {
                return res.status(403).json({ 
                    error: req.t('quiz:access_denied_different_department')
                });
            }

            // Migrate data if needed
            quiz = migrateQuizData(quiz);
            res.json(quiz);
        } catch (error) {
            res.status(404).json({ 
                error: error.message || req.t('quiz:quiz_not_found')
            });
        }
    }

    async updateQuiz(req, res) {
        try {
            // Check room edit permissions
            const quiz = await QuizService.getQuiz(req.params.id, req.t);
            const userRoomCode = req.session?.selectedRoom?.code;
            
            if (userRoomCode && quiz.roomCode && quiz.roomCode !== userRoomCode) {
                return res.status(403).json({ 
                    error: req.t('quiz:access_denied_edit_department')
                });
            }

            // Use QuizService with translation function
            const updatedQuiz = await QuizService.updateQuiz(req.params.id, req.body, req.files, req.t);
            
            console.log(`✅ Quiz "${updatedQuiz.title}" (Number: ${updatedQuiz.number}) updated in ${quiz.roomCode?.toUpperCase()} department by ${req.session.user.email}`);
            
            res.json(updatedQuiz);
        } catch (error) {
            console.error('Error updating quiz:', error);
            res.status(400).json({ 
                error: error.message || req.t('quiz:update_quiz_error')
            });
        }
    }

    async deleteQuiz(req, res) {
        try {
            // Check room delete permissions
            const quiz = await QuizService.getQuiz(req.params.id, req.t);
            const userRoomCode = req.session?.selectedRoom?.code;
            
            if (userRoomCode && quiz.roomCode && quiz.roomCode !== userRoomCode) {
                return res.status(403).json({ 
                    error: req.t('quiz:access_denied_delete_department')
                });
            }

            // Use QuizService with translation function
            const result = await QuizService.deleteQuiz(req.params.id, req.t);
            
            console.log(`🗑️ Quiz "${quiz.title}" (Number: ${quiz.number}) deleted from ${quiz.roomCode?.toUpperCase()} department by ${req.session.user.email}`);
            
            res.json(result);
        } catch (error) {
            res.status(400).json({ 
                error: error.message || req.t('quiz:delete_quiz_error')
            });
        }
    }

    // Unified render method for both create and edit with i18n
    renderCreateQuiz(req, res) {
        const roomInfo = req.session?.selectedRoom;
        if (!roomInfo) {
            return res.redirect('/auth/admin/select-room');
        }

        res.render('quiz/form', {
            title: req.t('quiz:create_new_quiz') + ' - ' + getRoomName(roomInfo.code),
            isEdit: false,
            quiz: null,
            user: req.session.user,
            roomInfo: roomInfo,
            lng: req.language || 'vi',
            // Pass all i18n helpers
            t: req.t,
            ti: res.locals.ti,
            formatDate: res.locals.formatDate,
            formatNumber: res.locals.formatNumber,
            layout: false
        });
    }

    async renderEditQuiz(req, res) {
        try {
            // Use QuizService with translation function
            let quiz = await QuizService.getQuiz(req.params.id, req.t);
            
            // Check room access permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && quiz.roomCode && quiz.roomCode !== userRoomCode) {
                return res.status(403).render('error/403', {
                    title: req.t('error:access_denied'),
                    message: req.t('quiz:access_denied_edit_department'),
                    lng: req.language || 'vi',
                    t: req.t,
                    layout: false
                });
            }

            // Migrate data if needed for backward compatibility
            quiz = migrateQuizData(quiz);
            
            const roomInfo = req.session?.selectedRoom;
            
            res.render('quiz/form', {
                title: req.t('quiz:edit_quiz') + ` #${quiz.number} - ` + getRoomName(roomInfo?.code || quiz.roomCode),
                isEdit: true,
                quiz: quiz,
                user: req.session.user,
                roomInfo: roomInfo,
                lng: req.language || 'vi',
                // Pass all i18n helpers
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber,
                layout: false
            });
        } catch (error) {
            console.error('Error loading quiz for edit:', error);
            res.status(404).render('error/404', {
                title: req.t('error:quiz_not_found'),
                message: req.t('error:quiz_not_found_desc'),
                lng: req.language || 'vi',
                t: req.t,
                layout: false
            });
        }
    }

    // Enhanced getQuizzes method with room filtering and i18n support
    async getQuizzes(req, res) {
        try {
            const user = req.session.user;
            const roomInfo = req.session?.selectedRoom;
            
            // Get pagination parameters
            const page = parseInt(req.query.page) || 1;
            const limit = 12; // Default 12 quizzes per page
            const skip = (page - 1) * limit;
            
            // Get roomCode for filtering
            const roomCode = roomInfo?.code;
            if (!roomCode) {
                return res.redirect('/auth/admin/select-room');
            }
            
            // Fetch all quizzes filtered by room code using QuizService with translation
            const allQuizzes = await QuizService.getAllQuizzes(req.t);
            const filteredQuizzes = allQuizzes.filter(quiz => quiz.roomCode === roomCode);
            
            // Apply pagination
            const totalQuizzes = filteredQuizzes.length;
            const totalPages = Math.ceil(totalQuizzes / limit);
            const paginatedQuizzes = filteredQuizzes.slice(skip, skip + limit);
            
            // Add additional stats and formatting with quiz number support
            const enhancedQuizzes = paginatedQuizzes.map(quiz => {
                // Migrate quiz data if needed
                const migratedQuiz = migrateQuizData(quiz);
                
                // Calculate completion percentage
                const completionRate = quiz.totalCount > 0 ? 
                    Math.round((quiz.completedCount / quiz.totalCount) * 100) : 0;
                
                // Format dates
                const createdDate = new Date(quiz.createdAt);
                const updatedDate = new Date(quiz.updatedAt);
                const now = new Date();
                
                // Calculate relative time with i18n
                const daysDiff = Math.floor((now - updatedDate) / (1000 * 60 * 60 * 24));
                let relativeTime;
                if (daysDiff === 0) {
                    relativeTime = req.t('quiz:today');
                } else if (daysDiff === 1) {
                    relativeTime = req.t('quiz:yesterday');
                } else if (daysDiff < 7) {
                    relativeTime = req.t('quiz:days_ago', { count: daysDiff });
                } else {
                    relativeTime = res.locals.formatDate(updatedDate);
                }
                
                return {
                    ...migratedQuiz.toObject ? migratedQuiz.toObject() : migratedQuiz,
                    // Include quiz number
                    number: quiz.number,
                    completionRate,
                    relativeTime,
                    isRecent: daysDiff <= 7,
                    hasParticipants: (quiz.totalCount || 0) > 0,
                    averageScore: quiz.averageScore || 0,
                    status: getQuizStatus(quiz),
                    estimatedDuration: estimateQuizDuration(migratedQuiz.questions),
                    // Enhanced metadata
                    totalDuration: migratedQuiz.questions ? 
                        migratedQuiz.questions.reduce((sum, q) => sum + (q.answerTime || 30), 0) : 0,
                    hasImages: migratedQuiz.questions ? 
                        migratedQuiz.questions.some(q => q.image) : false,
                    optionCounts: migratedQuiz.questions ? 
                        migratedQuiz.questions.map(q => q.options ? q.options.length : 2) : []
                };
            });
            
            // Calculate summary statistics for current room
            const stats = {
                total: totalQuizzes,
                online: filteredQuizzes.filter(q => q.mode === 'online').length,
                offline: filteredQuizzes.filter(q => q.mode === 'offline').length,
                active: filteredQuizzes.filter(q => q.status === 'active').length,
                totalParticipants: filteredQuizzes.reduce((sum, q) => sum + (q.totalCount || 0), 0),
                averageQuestions: filteredQuizzes.length > 0 ? 
                    Math.round(filteredQuizzes.reduce((sum, q) => sum + q.questions.length, 0) / filteredQuizzes.length) : 0,
                totalDuration: filteredQuizzes.reduce((sum, q) => {
                    const duration = q.questions ? q.questions.reduce((qSum, question) => qSum + (question.answerTime || 30), 0) : 0;
                    return sum + duration;
                }, 0),
                // Quiz number stats
                numberRange: filteredQuizzes.length > 0 ? {
                    lowest: Math.min(...filteredQuizzes.map(q => q.number || 999999)),
                    highest: Math.max(...filteredQuizzes.map(q => q.number || 0))
                } : null
            };
            
            res.render('quiz/list', {
                title: req.t('quiz:quiz_management') + ' - ' + getRoomName(roomCode),
                user: user,
                quizzes: enhancedQuizzes,
                stats: stats,
                roomInfo: roomInfo,
                lng: req.language || 'vi',
                // Pass all i18n helpers
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber,
                // Pagination data
                currentPage: page,
                totalPages: totalPages,
                totalQuizzes: totalQuizzes,
                pagination: {
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    nextPage: page + 1,
                    prevPage: page - 1,
                    pages: Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        const startPage = Math.max(1, page - 2);
                        return startPage + i;
                    }).filter(p => p <= totalPages)
                },
                layout: false
            });
            
        } catch (error) {
            console.error('Error fetching quizzes:', error);
            res.status(500).render('error/500', {
                title: req.t('error:server_error'),
                message: req.t('error:unable_load_quizzes'),
                lng: req.language || 'vi',
                t: req.t,
                layout: false
            });
        }
    }

    async previewQuiz(req, res) {
        try {
            // Use QuizService with translation function
            let quiz = await QuizService.getQuiz(req.params.id, req.t);
            
            // Check room access permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && quiz.roomCode && quiz.roomCode !== userRoomCode) {
                return res.status(403).render('error/403', {
                    title: req.t('error:access_denied'),
                    message: req.t('quiz:access_denied_preview_department'),
                    lng: req.language || 'vi',
                    t: req.t,
                    layout: false
                });
            }

            // Migrate data if needed
            quiz = migrateQuizData(quiz);

            res.render('quiz/preview', {
                title: req.t('quiz:preview_quiz') + ` #${quiz.number} - ` + getRoomName(quiz.roomCode),
                quiz: quiz,
                isPreview: true,
                user: req.session.user,
                roomInfo: req.session?.selectedRoom,
                lng: req.language || 'vi',
                // Pass all i18n helpers
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber,
                layout: false
            });
        } catch (error) {
            console.error('Error loading quiz preview:', error);
            res.status(404).render('error/404', {
                title: req.t('error:quiz_not_found'),
                message: req.t('error:quiz_not_found_desc'),
                lng: req.language || 'vi',
                t: req.t,
                layout: false
            });
        }
    }

    // Enhanced duplication with room code preservation and i18n
    async duplicateQuiz(req, res) {
        try {
            const originalQuizId = req.params.id;
            
            // Get the original quiz using QuizService with translation
            let originalQuiz = await QuizService.getQuiz(originalQuizId, req.t);
            if (!originalQuiz) {
                return res.status(404).json({
                    success: false,
                    message: req.t('quiz:original_quiz_not_found')
                });
            }

            // Check room duplicate permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && originalQuiz.roomCode && originalQuiz.roomCode !== userRoomCode) {
                return res.status(403).json({
                    success: false,
                    message: req.t('quiz:access_denied_duplicate_department')
                });
            }
            
            // Migrate data if needed
            originalQuiz = migrateQuizData(originalQuiz);
            
            // Create new quiz data in new format with same room code
            const copyLabel = req.t('quiz:copy');
            const duplicateData = {
                quizInfo: JSON.stringify({
                    title: `${originalQuiz.title} (${copyLabel})`,
                    mode: originalQuiz.mode,
                    roomCode: originalQuiz.roomCode, // Preserve room code
                    scheduleSettings: originalQuiz.scheduleSettings
                }),
                questionsData: JSON.stringify(originalQuiz.questions.map((q, index) => ({
                    number: index + 1,
                    content: q.content,
                    answerTime: q.answerTime || 30,
                    options: q.options || [
                        { letter: 'A', text: '' },
                        { letter: 'B', text: '' }
                    ],
                    correctAnswer: q.correctAnswer || 'A'
                })))
            };
            
            // Create the duplicate using QuizService with translation
            const duplicatedQuiz = await QuizService.createQuiz(duplicateData, null, req.t);
            
            // Log the action
            console.log(`📋 Quiz "${originalQuiz.title}" (Number: ${originalQuiz.number}) duplicated as Quiz #${duplicatedQuiz.number} in ${originalQuiz.roomCode?.toUpperCase()} department by user ${req.session.user.email}`);
            
            res.json({
                success: true,
                message: req.t('quiz:quiz_duplicated_as_number', { number: duplicatedQuiz.number }),
                quiz: {
                    id: duplicatedQuiz._id,
                    number: duplicatedQuiz.number,
                    title: duplicatedQuiz.title,
                    roomCode: duplicatedQuiz.roomCode
                }
            });
            
        } catch (error) {
            console.error('Duplicate quiz error:', error);
            res.status(500).json({
                success: false,
                message: req.t('quiz:failed_duplicate_quiz'),
                error: process.env.NODE_ENV === 'development' ? error.message : req.t('error:server_error')
            });
        }
    }

    // Enhanced delete method with room access check and i18n
    async deleteQuizEnhanced(req, res) {
        try {
            const quizId = req.params.id;
            
            // Verify quiz exists and user has permission using QuizService with translation
            const quiz = await QuizService.getQuiz(quizId, req.t);
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: req.t('quiz:quiz_not_found')
                });
            }

            // Check room delete permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && quiz.roomCode && quiz.roomCode !== userRoomCode) {
                return res.status(403).json({
                    success: false,
                    message: req.t('quiz:access_denied_delete_department')
                });
            }
            
            // Check if quiz has active participants (optional business logic)
            const hasActiveParticipants = quiz.totalCount > 0;
            if (hasActiveParticipants) {
                console.log(`⚠️ Warning: Deleting quiz #${quiz.number} with ${quiz.totalCount} participants`);
            }
            
            // Delete the quiz using QuizService with translation
            await QuizService.deleteQuiz(quizId, req.t);
            
            // Log the action
            console.log(`🗑️ Quiz "${quiz.title}" (Number: ${quiz.number}, ID: ${quizId}) deleted from ${quiz.roomCode?.toUpperCase()} department by user ${req.session.user.email}`);
            
            res.json({
                success: true,
                message: req.t('quiz:quiz_number_deleted', { number: quiz.number })
            });
            
        } catch (error) {
            console.error('Delete quiz error:', error);
            res.status(500).json({
                success: false,
                message: req.t('quiz:failed_delete_quiz'),
                error: process.env.NODE_ENV === 'development' ? error.message : req.t('error:server_error')
            });
        }
    }

    // Enhanced analytics method with room filtering and i18n
    async getAnalytics(req, res) {
        try {
            const roomCode = req.session?.selectedRoom?.code;
            
            // Use QuizService with translation function
            const analytics = await QuizService.getQuizAnalytics(roomCode, req.t);
            
            res.json(analytics);
            
        } catch (error) {
            console.error('Analytics error:', error);
            res.status(500).json({
                success: false,
                message: req.t('quiz:failed_fetch_analytics')
            });
        }
    }

    // Method to migrate existing quizzes to add room codes with i18n
    async migrateQuizzes(req, res) {
        try {
            const { targetRoom } = req.body; // Room code to assign to all existing quizzes
            
            if (!targetRoom || !['hrm', 'hse', 'gm', 'qasx', 'sm'].includes(targetRoom)) {
                return res.status(400).json({
                    success: false,
                    message: req.t('quiz:specify_valid_target_room')
                });
            }

            // Use QuizService with translation function
            const result = await QuizService.assignRoomCodeToQuizzes(targetRoom, null, req.t);
            
            res.json({
                success: true,
                message: req.t('quiz:migration_completed', { 
                    count: result.modifiedCount,
                    roomName: getRoomName(targetRoom)
                }),
                migratedCount: result.modifiedCount,
                totalQuizzes: result.totalQuizzes || 0,
                targetRoom: targetRoom,
                roomName: getRoomName(targetRoom)
            });
            
        } catch (error) {
            console.error('Migration error:', error);
            res.status(500).json({
                success: false,
                message: req.t('quiz:migration_failed'),
                error: error.message
            });
        }
    }
}

module.exports = new QuizController();
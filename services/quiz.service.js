const Quiz = require('../models/quiz.model');
const fs = require('fs');
const path = require('path');

class QuizService {
    async createQuiz(quizData, files, t = null) {
        try {
            // Default translation function
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'quiz:room_code_required': 'Valid room code (hrm, hse, gm, qasx or sm) is required',
                    'quiz:quiz_created': 'Quiz "{{title}}" (Number: {{number}}) created successfully for {{department}} department with {{questionCount}} questions',
                    'quiz:create_quiz_error': 'Error creating quiz: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const quizInfo = JSON.parse(quizData.quizInfo);
            const questionsData = JSON.parse(quizData.questionsData);
            
            // Validate room code (REQUIRED for new quizzes)
            if (!quizInfo.roomCode || !['hrm', 'hse', 'gm', 'qasx', 'sm'].includes(quizInfo.roomCode)) {
                throw new Error(translate('quiz:room_code_required'));
            }
            
            // Process images and save paths
            const processedQuestions = questionsData.map(question => {
                const imageKey = `questionImage_${question.number}`;
                let imageFile = null;
                
                // Find the correct image file
                if (files) {
                    if (Array.isArray(files)) {
                        imageFile = files.find(f => f.fieldname === imageKey);
                    } else if (typeof files === 'object') {
                        imageFile = Object.values(files).flat().find(f => f.fieldname === imageKey);
                    }
                }

                let imagePath = null;
                if (imageFile && imageFile.path) {
                    try {
                        const pathParts = imageFile.path.split('public');
                        if (pathParts.length > 1) {
                            imagePath = '/' + pathParts[1].replace(/\\/g, '/');
                            if (imagePath.startsWith('//')) {
                                imagePath = imagePath.substring(1);
                            }
                        }
                    } catch (error) {
                        console.error('Error processing image path:', error);
                        imagePath = null;
                    }
                }
                
                // Process options - ensure they have the correct format
                const processedOptions = [];
                if (question.options && Array.isArray(question.options)) {
                    question.options.forEach(option => {
                        if (option && option.text && option.text.trim()) {
                            processedOptions.push({
                                letter: option.letter,
                                text: option.text.trim()
                            });
                        }
                    });
                }
                
                // Ensure at least 2 options exist
                if (processedOptions.length < 2) {
                    while (processedOptions.length < 2) {
                        const letter = String.fromCharCode(65 + processedOptions.length); // A, B, C, D, E, F
                        processedOptions.push({
                            letter: letter,
                            text: ''
                        });
                    }
                }
                
                return {
                    number: question.number,
                    content: question.content.trim(),
                    answerTime: Math.max(5, Math.min(300, parseInt(question.answerTime) || 30)), // 5-300 seconds
                    options: processedOptions,
                    correctAnswer: question.correctAnswer || 'A',
                    image: imagePath
                };
            });
            
            // Calculate total duration
            const totalDuration = processedQuestions.reduce((sum, q) => sum + q.answerTime, 0);
            
            // Create quiz document with new schema including roomCode
            const quiz = new Quiz({
                title: quizInfo.title.trim(),
                mode: quizInfo.mode,
                roomCode: quizInfo.roomCode,
                scheduleSettings: quizInfo.mode === 'offline' ? quizInfo.scheduleSettings : null,
                questions: processedQuestions,
                createdBy: null, // Add user ID here if available from req.session
                metadata: {
                    totalDuration: totalDuration,
                    version: '2.0',
                    estimatedDuration: this.formatDuration(totalDuration),
                    difficulty: this.calculateDifficulty(processedQuestions),
                    tags: this.extractTags(quizInfo.title),
                    lastModified: new Date()
                }
            });
            
            await quiz.save();
            
            console.log(translate('quiz:quiz_created', {
                title: quiz.title,
                number: quiz.number,
                department: quiz.roomCode.toUpperCase(),
                questionCount: processedQuestions.length
            }));
            
            return quiz;
            
        } catch (error) {
            // Delete uploaded files if error occurs
            if (files) {
                const filesToDelete = Array.isArray(files) ? files : Object.values(files).flat();
                filesToDelete.forEach(file => {
                    if (file && file.path) {
                        fs.unlink(file.path, err => {
                            if (err) console.error('Error deleting file:', err);
                        });
                    }
                });
            }
            
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            
            throw new Error(translate('quiz:create_quiz_error', { error: error.message }));
        }
    }

    async getQuiz(id, t = null) {
        try {
            const translate = t || ((key) => {
                const messages = {
                    'quiz:quiz_not_found': 'Quiz not found',
                    'quiz:get_quiz_error': 'Error getting quiz: {{error}}'
                };
                return messages[key] || key;
            });

            const quiz = await Quiz.findById(id);
            if (!quiz) {
                throw new Error(translate('quiz:quiz_not_found'));
            }
            return quiz;
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('quiz:get_quiz_error', { error: error.message }));
        }
    }

    // Get quizzes by room code
    async getQuizzesByRoom(roomCode, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'quiz:valid_room_code_required': 'Valid room code is required',
                    'quiz:fetch_quizzes_error': 'Error fetching quizzes for room {{roomCode}}: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            if (!roomCode || !['hrm', 'hse', 'gm', 'qasx', 'sm'].includes(roomCode)) {
                throw new Error(translate('quiz:valid_room_code_required'));
            }
            
            const quizzes = await Quiz.find({ roomCode: roomCode })
                .select('number title mode questions scheduleSettings createdAt updatedAt metadata roomCode')
                .sort({ number: -1 }); // Sort by quiz number descending

            return quizzes;
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('quiz:fetch_quizzes_error', { 
                roomCode: roomCode, 
                error: error.message 
            }));
        }
    }

    async updateQuiz(id, quizData, files, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'quiz:quiz_not_found': 'Quiz not found',
                    'quiz:quiz_updated': 'Quiz "{{title}}" (Number: {{number}}) updated successfully in {{department}} department',
                    'quiz:update_quiz_error': 'Error updating quiz: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const quiz = await Quiz.findById(id);
            if (!quiz) {
                throw new Error(translate('quiz:quiz_not_found'));
            }

            const quizInfo = JSON.parse(quizData.quizInfo);
            const questionsData = JSON.parse(quizData.questionsData);
            
            // Preserve existing roomCode if not provided (for backward compatibility)
            let roomCode = quiz.roomCode;
            if (quizInfo.roomCode && ['hrm', 'hse', 'gm', 'qasx', 'sm'].includes(quizInfo.roomCode)) {
                roomCode = quizInfo.roomCode;
            }
            
            // Process images and save paths (similar to createQuiz)
            const processedQuestions = questionsData.map(question => {
                // [Image processing logic - same as in createQuiz]
                const imageKey = `questionImage_${question.number}`;
                let imageFile = null;
                
                if (files) {
                    if (Array.isArray(files)) {
                        imageFile = files.find(f => f.fieldname === imageKey);
                    } else if (typeof files === 'object') {
                        imageFile = Object.values(files).flat().find(f => f.fieldname === imageKey);
                    }
                }

                let imagePath = null;

                // Handle new image upload
                if (imageFile && imageFile.path) {
                    try {
                        const pathParts = imageFile.path.split('public');
                        if (pathParts.length > 1 && pathParts[1]) {
                            imagePath = pathParts[1].replace(/\\/g, '/');
                            if (!imagePath.startsWith('/')) {
                                imagePath = '/' + imagePath;
                            }
                            imagePath = imagePath.replace(/\/+/g, '/');
                        } else {
                            const filename = path.basename(imageFile.path);
                            imagePath = `/uploads/quiz_images/${filename}`;
                        }
                        
                        // Delete old image if exists
                        const oldQuestion = quiz.questions.find(q => q.number === question.number);
                        if (oldQuestion?.image) {
                            const oldImagePath = path.join(__dirname, '../public', oldQuestion.image);
                            fs.unlink(oldImagePath, err => {
                                if (err) console.log('Note: Could not delete old image:', err.message);
                            });
                        }
                    } catch (error) {
                        console.error('Error processing image path:', error);
                        imagePath = null;
                    }
                } else {
                    // Keep existing image or remove it
                    const existingQuestion = quiz.questions.find(q => q.number === question.number);
                    if (question.image === null || question.image === '') {
                        // Image was removed
                        if (existingQuestion?.image) {
                            const oldImagePath = path.join(__dirname, '../public', existingQuestion.image);
                            fs.unlink(oldImagePath, err => {
                                if (err) console.log('Note: Could not delete removed image:', err.message);
                            });
                        }
                        imagePath = null;
                    } else {
                        // Keep existing image
                        imagePath = existingQuestion?.image || null;
                    }
                }

                // Process options
                const processedOptions = [];
                if (question.options && Array.isArray(question.options)) {
                    question.options.forEach(option => {
                        if (option && option.text && option.text.trim()) {
                            processedOptions.push({
                                letter: option.letter,
                                text: option.text.trim()
                            });
                        }
                    });
                }
                
                // Ensure minimum options
                if (processedOptions.length < 2) {
                    while (processedOptions.length < 2) {
                        const letter = String.fromCharCode(65 + processedOptions.length);
                        processedOptions.push({
                            letter: letter,
                            text: ''
                        });
                    }
                }

                return {
                    number: question.number,
                    content: question.content.trim(),
                    answerTime: Math.max(5, Math.min(300, parseInt(question.answerTime) || 30)),
                    options: processedOptions,
                    correctAnswer: question.correctAnswer || 'A',
                    image: imagePath
                };
            });

            // Handle deleted questions' images
            quiz.questions.forEach(oldQuestion => {
                const stillExists = processedQuestions.some(q => q.number === oldQuestion.number);
                if (!stillExists && oldQuestion.image) {
                    const oldImagePath = path.join(__dirname, '../public', oldQuestion.image);
                    fs.unlink(oldImagePath, err => {
                        if (err) console.error('Error deleting removed question image:', err);
                    });
                }
            });

            // Calculate new total duration
            const totalDuration = processedQuestions.reduce((sum, q) => sum + q.answerTime, 0);

            // Update quiz document with roomCode (preserve quiz.number - don't change it)
            const updatedQuiz = await Quiz.findByIdAndUpdate(
                id,
                {
                    title: quizInfo.title.trim(),
                    mode: quizInfo.mode,
                    roomCode: roomCode,
                    scheduleSettings: quizInfo.mode === 'offline' ? quizInfo.scheduleSettings : null,
                    questions: processedQuestions,
                    'metadata.totalDuration': totalDuration,
                    'metadata.lastModified': new Date(),
                    'metadata.estimatedDuration': this.formatDuration(totalDuration),
                    'metadata.difficulty': this.calculateDifficulty(processedQuestions),
                    'metadata.tags': this.extractTags(quizInfo.title),
                    'metadata.version': '2.0'
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            console.log(translate('quiz:quiz_updated', {
                title: updatedQuiz.title,
                number: updatedQuiz.number,
                department: roomCode?.toUpperCase()
            }));
            
            return updatedQuiz;

        } catch (error) {
            // Delete uploaded files if error occurs
            if (files) {
                const filesToDelete = Array.isArray(files) ? files : Object.values(files).flat();
                filesToDelete.forEach(file => {
                    if (file && file.path) {
                        fs.unlink(file.path, err => {
                            if (err) console.error('Error deleting file:', err);
                        });
                    }
                });
            }
            
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            
            throw new Error(translate('quiz:update_quiz_error', { error: error.message }));
        }
    }

    async deleteQuiz(id, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'quiz:quiz_not_found': 'Quiz not found',
                    'quiz:quiz_deleted': 'Quiz "{{title}}" (Number: {{number}}) deleted successfully from {{department}} department',
                    'quiz:delete_quiz_error': 'Error deleting quiz: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const quiz = await Quiz.findById(id);
            if (!quiz) {
                throw new Error(translate('quiz:quiz_not_found'));
            }

            // Delete associated images from local storage
            quiz.questions.forEach(question => {
                if (question.image) {
                    const imagePath = path.join(__dirname, '../public', question.image);
                    fs.unlink(imagePath, err => {
                        if (err) console.error('Error deleting image:', err);
                    });
                }
            });

            await Quiz.findByIdAndDelete(id);
            
            console.log(translate('quiz:quiz_deleted', {
                title: quiz.title,
                number: quiz.number,
                department: quiz.roomCode?.toUpperCase()
            }));
            
            return { 
                message: translate('quiz:quiz_deleted', {
                    title: quiz.title,
                    number: quiz.number,
                    department: quiz.roomCode?.toUpperCase()
                })
            };
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('quiz:delete_quiz_error', { error: error.message }));
        }
    }

    async getAllQuizzes(t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'quiz:fetch_all_quizzes_error': 'Error fetching quizzes: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const quizzes = await Quiz.find()
                .select('number title mode roomCode questions scheduleSettings createdAt updatedAt metadata')
                .sort({updatedAt: -1,  number: 1}); // Sort by quiz number ascending

            return quizzes.map(quiz => {
                const quizObject = quiz.toObject();
                
                // Calculate enhanced statistics
                const questionCount = quiz.questions.length;
                const hasImages = quiz.questions.some(q => q.image);
                const totalDuration = quiz.questions.reduce((sum, q) => sum + (q.answerTime || 30), 0);
                
                // Calculate average options per question
                const averageOptions = questionCount > 0 ? 
                    quiz.questions.reduce((sum, q) => sum + (q.options ? q.options.length : 2), 0) / questionCount : 0;
                
                return {
                    ...quizObject,
                    // Include quiz number in returned data
                    number: quiz.number,
                    questionCount: questionCount,
                    completedCount: 0, // TODO: Implement completion tracking
                    totalCount: 0,     // TODO: Implement participant counting
                    averageScore: 0,   // TODO: Implement score tracking
                    formattedDate: new Date(quiz.updatedAt).toLocaleDateString(),
                    // Enhanced metadata
                    hasImages: hasImages,
                    totalDuration: totalDuration,
                    formattedDuration: this.formatDuration(totalDuration),
                    averageOptions: Math.round(averageOptions * 10) / 10,
                    difficulty: this.getDifficultyLabel(this.calculateDifficultyScore(quiz.questions)),
                    difficultyScore: this.calculateDifficultyScore(quiz.questions),
                    tags: quizObject.metadata?.tags || [],
                    isRecent: this.isRecentlyUpdated(quiz.updatedAt),
                    status: this.getQuizStatus(quiz),
                    version: quizObject.metadata?.version || '1.0',
                    // Room information
                    roomName: this.getRoomName(quiz.roomCode)
                };
            });
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('quiz:fetch_all_quizzes_error', { error: error.message }));
        }
    }

    // Get quiz statistics by room
    async getQuizStatsByRoom(roomCode, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'quiz:valid_room_code_required': 'Valid room code is required',
                    'quiz:get_quiz_stats_error': 'Error getting quiz stats for room {{roomCode}}: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            if (!roomCode || !['hrm', 'hse', 'gm', 'qasx', 'sm'].includes(roomCode)) {
                throw new Error(translate('quiz:valid_room_code_required'));
            }

            const quizzes = await this.getQuizzesByRoom(roomCode, t);
            
            return {
                roomCode: roomCode,
                roomName: this.getRoomName(roomCode),
                totalQuizzes: quizzes.length,
                totalQuestions: quizzes.reduce((sum, quiz) => sum + quiz.questions.length, 0),
                totalDuration: quizzes.reduce((sum, quiz) => {
                    return sum + quiz.questions.reduce((qSum, question) => {
                        return qSum + (question.answerTime || 30);
                    }, 0);
                }, 0),
                byMode: {
                    online: quizzes.filter(q => q.mode === 'online').length,
                    offline: quizzes.filter(q => q.mode === 'offline').length
                },
                recentQuizzes: quizzes.filter(quiz => {
                    const daysDiff = Math.floor((new Date() - new Date(quiz.createdAt)) / (1000 * 60 * 60 * 24));
                    return daysDiff <= 7;
                }).length,
                // Quiz number stats
                firstQuizNumber: quizzes.length > 0 ? Math.min(...quizzes.map(q => q.number || 999999)) : null,
                lastQuizNumber: quizzes.length > 0 ? Math.max(...quizzes.map(q => q.number || 0)) : null
            };
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('quiz:get_quiz_stats_error', { 
                roomCode: roomCode, 
                error: error.message 
            }));
        }
    }

    // Helper method to get room name
    getRoomName(roomCode) {
        const roomNames = {
            'hrm': 'Human Resource Management',
            'hse': 'Health, Safety & Environment',
            'gm': 'General Management',
            "qasx": "Quality Assurance - Production",
            "sm": "Sales Marketing",
        };
        return roomNames[roomCode] || roomCode?.toUpperCase() || 'Unknown';
    }

    // Helper methods for enhanced functionality
    formatDuration(totalSeconds) {
        if (totalSeconds < 60) {
            return `${totalSeconds}s`;
        } else if (totalSeconds < 3600) {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
        } else {
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }
    }

    calculateDifficulty(questions) {
        if (!questions || questions.length === 0) return 'Easy';
        
        let difficultyScore = 0;
        
        questions.forEach(question => {
            // Base difficulty
            difficultyScore += 10;
            
            // More options = slightly harder
            const optionCount = question.options ? question.options.length : 2;
            if (optionCount > 4) {
                difficultyScore += 5;
            } else if (optionCount > 2) {
                difficultyScore += 2;
            }
            
            // Longer content = harder
            if (question.content.length > 150) {
                difficultyScore += 10;
            } else if (question.content.length > 75) {
                difficultyScore += 5;
            }
            
            // Shorter time = harder
            if (question.answerTime < 20) {
                difficultyScore += 15;
            } else if (question.answerTime < 30) {
                difficultyScore += 5;
            }
            
            // Images might make it easier (visual aids)
            if (question.image) {
                difficultyScore -= 5;
            }
        });
        
        const averageScore = questions.length > 0 ? difficultyScore / questions.length : 0;
        return this.getDifficultyLabel(averageScore);
    }

    calculateDifficultyScore(questions) {
        if (!questions || questions.length === 0) return 0;
        
        let totalScore = 0;
        
        questions.forEach(question => {
            let questionScore = 20; // Base score
            
            // Option count factor
            const optionCount = question.options ? question.options.length : 2;
            if (optionCount > 4) {
                questionScore += 15;
            } else if (optionCount > 2) {
                questionScore += 5;
            }
            
            // Content length factor
            if (question.content.length > 150) {
                questionScore += 20;
            } else if (question.content.length > 75) {
                questionScore += 10;
            }
            
            // Time pressure factor
            if (question.answerTime < 20) {
                questionScore += 25;
            } else if (question.answerTime < 30) {
                questionScore += 10;
            } else if (question.answerTime > 60) {
                questionScore -= 10;
            }
            
            // Visual aid factor
            if (question.image) {
                questionScore -= 10;
            }
            
            totalScore += questionScore;
        });
        
        return Math.min(100, Math.max(0, Math.round(totalScore / questions.length)));
    }

    getDifficultyLabel(score) {
        if (score <= 25) return 'Easy';
        if (score <= 50) return 'Medium';
        if (score <= 75) return 'Hard';
        return 'Expert';
    }

    extractTags(title) {
        const commonTags = [
            'math', 'science', 'history', 'english', 'geography', 
            'biology', 'chemistry', 'physics', 'literature', 'art',
            'technology', 'programming', 'business', 'economics',
            'music', 'sports', 'culture', 'language', 'computer'
        ];
        
        const titleLower = title.toLowerCase();
        return commonTags.filter(tag => titleLower.includes(tag));
    }

    isRecentlyUpdated(updatedAt) {
        const daysDiff = Math.floor((new Date() - new Date(updatedAt)) / (1000 * 60 * 60 * 24));
        return daysDiff <= 7;
    }

    getQuizStatus(quiz) {
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

    // Enhanced analytics methods with room filtering
    async getQuizAnalytics(roomCode = null, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'quiz:analytics_error': 'Error getting quiz analytics: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            let quizzes;
            if (roomCode) {
                quizzes = await this.getQuizzesByRoom(roomCode, t);
            } else {
                quizzes = await Quiz.find().select('number title mode roomCode language questions createdAt updatedAt metadata');
            }
            
            const totalQuizzes = quizzes.length;
            const totalQuestions = quizzes.reduce((sum, quiz) => sum + quiz.questions.length, 0);
            const totalDuration = quizzes.reduce((sum, quiz) => {
                return sum + quiz.questions.reduce((qSum, question) => {
                    return qSum + (question.answerTime || 30);
                }, 0);
            }, 0);
            
            const modeDistribution = quizzes.reduce((acc, quiz) => {
                acc[quiz.mode] = (acc[quiz.mode] || 0) + 1;
                return acc;
            }, {});

            // Room distribution (if not filtering by specific room)
            const roomDistribution = roomCode ? null : quizzes.reduce((acc, quiz) => {
                const room = quiz.roomCode || 'unassigned';
                acc[room] = (acc[room] || 0) + 1;
                return acc;
            }, {});
            
            // Enhanced option analysis
            const optionDistribution = {};
            let totalOptionsCount = 0;
            quizzes.forEach(quiz => {
                quiz.questions.forEach(question => {
                    const optionCount = question.options ? question.options.length : 2;
                    optionDistribution[optionCount] = (optionDistribution[optionCount] || 0) + 1;
                    totalOptionsCount += optionCount;
                });
            });
            
            const averageQuestionsPerQuiz = totalQuizzes > 0 ? Math.round(totalQuestions / totalQuizzes) : 0;
            const averageOptionsPerQuestion = totalQuestions > 0 ? Math.round((totalOptionsCount / totalQuestions) * 10) / 10 : 0;
            const averageDurationPerQuiz = totalQuizzes > 0 ? Math.round(totalDuration / totalQuizzes) : 0;
            
            const recentQuizzes = quizzes.filter(quiz => {
                const daysDiff = Math.floor((new Date() - new Date(quiz.createdAt)) / (1000 * 60 * 60 * 24));
                return daysDiff <= 30;
            }).length;

            // Quiz number analytics
            const quizNumbers = quizzes.map(q => q.number).filter(n => n);
            const numberStats = quizNumbers.length > 0 ? {
                lowest: Math.min(...quizNumbers),
                highest: Math.max(...quizNumbers),
                range: Math.max(...quizNumbers) - Math.min(...quizNumbers) + 1,
                gaps: this.findNumberGaps(quizNumbers)
            } : null;
            
            return {
                roomInfo: roomCode ? {
                    code: roomCode,
                    name: this.getRoomName(roomCode)
                } : null,
                overview: {
                    totalQuizzes,
                    totalQuestions,
                    totalDuration: this.formatDuration(totalDuration),
                    averageQuestionsPerQuiz,
                    averageOptionsPerQuestion,
                    averageDurationPerQuiz: this.formatDuration(averageDurationPerQuiz),
                    recentQuizzes
                },
                distributions: {
                    mode: modeDistribution,
                    room: roomDistribution,
                    optionCounts: optionDistribution
                },
                trends: {
                    weeklyGrowth: 0, // TODO: Implement trend analysis
                    monthlyGrowth: 0,
                    popularTimes: [],
                    difficultyTrends: this.analyzeDifficultyTrends(quizzes)
                },
                performance: {
                    questionsWithImages: quizzes.reduce((sum, quiz) => {
                        return sum + quiz.questions.filter(q => q.image).length;
                    }, 0),
                    averageTimePerQuestion: totalQuestions > 0 ? Math.round(totalDuration / totalQuestions) : 0,
                    versionDistribution: this.analyzeVersionDistribution(quizzes)
                },
                // Number analytics
                numberStats: numberStats
            };
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('quiz:analytics_error', { error: error.message }));
        }
    }

    // Helper method to find gaps in quiz numbers
    findNumberGaps(numbers) {
        if (numbers.length === 0) return [];
        
        const sortedNumbers = [...numbers].sort((a, b) => a - b);
        const gaps = [];
        
        for (let i = 0; i < sortedNumbers.length - 1; i++) {
            const current = sortedNumbers[i];
            const next = sortedNumbers[i + 1];
            
            if (next - current > 1) {
                for (let gap = current + 1; gap < next; gap++) {
                    gaps.push(gap);
                }
            }
        }
        
        return gaps;
    }

    analyzeDifficultyTrends(quizzes) {
        const difficulties = { Easy: 0, Medium: 0, Hard: 0, Expert: 0 };
        
        quizzes.forEach(quiz => {
            const difficulty = this.calculateDifficulty(quiz.questions);
            difficulties[difficulty] = (difficulties[difficulty] || 0) + 1;
        });
        
        return difficulties;
    }

    analyzeVersionDistribution(quizzes) {
        const versions = {};
        
        quizzes.forEach(quiz => {
            const version = quiz.metadata?.version || '1.0';
            versions[version] = (versions[version] || 0) + 1;
        });
        
        return versions;
    }

    // Search functionality with enhanced filters including room code and quiz number
    async searchQuizzes(searchParams, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'quiz:search_error': 'Error searching quizzes: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const { 
                query, 
                mode, 
                language, 
                difficulty, 
                tags, 
                minDuration, 
                maxDuration,
                minQuestions,
                maxQuestions,
                roomCode,
                minNumber,
                maxNumber,
                sortBy = 'newest' 
            } = searchParams;
            
            let mongoQuery = {};
            
            if (query) {
                mongoQuery.$or = [
                    { title: { $regex: query, $options: 'i' } },
                    { 'questions.content': { $regex: query, $options: 'i' } }
                ];
            }
            
            if (mode) {
                mongoQuery.mode = mode;
            }
            
            if (language) {
                mongoQuery.language = language;
            }

            // Filter by room code
            if (roomCode) {
                mongoQuery.roomCode = roomCode;
            }

            // Filter by quiz number range
            if (minNumber || maxNumber) {
                mongoQuery.number = {};
                if (minNumber) mongoQuery.number.$gte = parseInt(minNumber);
                if (maxNumber) mongoQuery.number.$lte = parseInt(maxNumber);
            }
            
            if (difficulty) {
                mongoQuery['metadata.difficulty'] = difficulty;
            }
            
            if (tags && tags.length > 0) {
                mongoQuery['metadata.tags'] = { $in: tags };
            }
            
            if (minDuration || maxDuration) {
                mongoQuery['metadata.totalDuration'] = {};
                if (minDuration) mongoQuery['metadata.totalDuration'].$gte = parseInt(minDuration);
                if (maxDuration) mongoQuery['metadata.totalDuration'].$lte = parseInt(maxDuration);
            }
            
            // For questions count, we need to use aggregation
            let pipeline = [
                { $match: mongoQuery },
                {
                    $addFields: {
                        questionCount: { $size: '$questions' }
                    }
                }
            ];
            
            if (minQuestions || maxQuestions) {
                const questionFilter = {};
                if (minQuestions) questionFilter.$gte = parseInt(minQuestions);
                if (maxQuestions) questionFilter.$lte = parseInt(maxQuestions);
                pipeline.push({ $match: { questionCount: questionFilter } });
            }
            
            // Add sorting
            let sortQuery = {};
            switch (sortBy) {
                case 'newest':
                    sortQuery = { createdAt: -1 };
                    break;
                case 'oldest':
                    sortQuery = { createdAt: 1 };
                    break;
                case 'name':
                    sortQuery = { title: 1 };
                    break;
                case 'number':
                    sortQuery = { number: 1 };
                    break;
                case 'questions':
                    sortQuery = { questionCount: -1 };
                    break;
                case 'duration':
                    sortQuery = { 'metadata.totalDuration': -1 };
                    break;
                case 'room':
                    sortQuery = { roomCode: 1, number: 1 };
                    break;
                default:
                    sortQuery = { number: 1 };
            }
            
            pipeline.push({ $sort: sortQuery });
            
            const quizzes = await Quiz.aggregate(pipeline);
            return quizzes;
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('quiz:search_error', { error: error.message }));
        }
    }

    // Method to migrate existing quizzes without roomCode
    async assignRoomCodeToQuizzes(targetRoomCode, quizIds = null, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'quiz:invalid_room_code': 'Invalid room code. Must be hrm, hse, gm, qasx or sm',
                    'quiz:room_assignment_success': 'Assigned {{roomCode}} room code to {{count}} quizzes',
                    'quiz:room_assignment_error': 'Error assigning room code: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            if (!['hrm', 'hse', 'gm', 'qasx', 'sm'].includes(targetRoomCode)) {
                throw new Error(translate('quiz:invalid_room_code'));
            }

            let filter = {};
            if (quizIds && Array.isArray(quizIds)) {
                filter._id = { $in: quizIds };
            } else {
                // Target quizzes without roomCode
                filter.roomCode = { $exists: false };
            }

            const result = await Quiz.updateMany(
                filter,
                { $set: { roomCode: targetRoomCode } }
            );

            console.log(translate('quiz:room_assignment_success', {
                roomCode: targetRoomCode.toUpperCase(),
                count: result.modifiedCount
            }));
            
            return {
                success: true,
                modifiedCount: result.modifiedCount,
                roomCode: targetRoomCode,
                roomName: this.getRoomName(targetRoomCode),
                message: translate('quiz:room_assignment_success', {
                    roomCode: targetRoomCode.toUpperCase(),
                    count: result.modifiedCount
                })
            };
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('quiz:room_assignment_error', { error: error.message }));
        }
    }
}

module.exports = new QuizService();
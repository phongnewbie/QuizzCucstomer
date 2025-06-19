const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Auth Routes
router.get('/login', authController.getLoginPage);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/register', authController.register);

// Player Routes (Protected)
router.get('/player/join-quiz', 
    authController.requireAuth, 
    authController.requirePlayer, 
    (req, res) => {
        res.render('player/join-quiz', {
            title: 'Join a Quiz',
            user: req.user,
            layout: false
        });
    }
);

router.post('/player/join-quiz',
    authController.requireAuth,
    authController.requirePlayer,
    async (req, res) => {
        try {
            const { pinCode, playerName } = req.body;
            
            // Validate input
            if (!pinCode || pinCode.length !== 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid 6-digit PIN code'
                });
            }
            
            if (!playerName || playerName.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid name (at least 2 characters)'
                });
            }

            // Find quiz by PIN code (assuming Quiz model has pinCode field)
            const Quiz = require('../models/quiz.model');
            const quiz = await Quiz.findOne({ 
                pinCode: pinCode,
                isActive: true,
                // Add additional conditions like schedule validation
            });

            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found or not currently active'
                });
            }

            // Check if quiz is within scheduled time (if applicable)
            if (quiz.scheduleSettings) {
                const now = new Date();
                if (now < quiz.scheduleSettings.startTime || now > quiz.scheduleSettings.endTime) {
                    return res.status(400).json({
                        success: false,
                        message: 'Quiz is not currently available'
                    });
                }
            }

            // Store quiz session and redirect to quiz lobby/room
            req.session.currentQuiz = {
                quizId: quiz._id,
                playerName: playerName.trim(),
                joinedAt: new Date()
            };

            res.json({
                success: true,
                message: 'Successfully joined quiz',
                redirectUrl: `/quiz/${quiz._id}/lobby`
            });

        } catch (error) {
            console.error('Join quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while joining the quiz'
            });
        }
    }
);

// ========================================
// NEW: ADMIN ROOM SELECTION ROUTES
// ========================================

// GET: Room selection page
router.get('/admin/select-room',
    authController.requireAuth,
    authController.requireAdmin,
    authController.getRoomSelectionPage
);

// POST: Handle room selection
router.post('/admin/select-room',
    authController.requireAuth,
    authController.requireAdmin,
    authController.selectRoom
);

// GET: Clear room selection (for testing/manual reset)
router.get('/admin/clear-room',
    authController.requireAuth,
    authController.requireAdmin,
    authController.clearRoomSelection
);

// Admin Routes (Protected) - UPDATED with room selection middleware
router.get('/admin/dashboard',
    authController.requireAuth,
    authController.requireAdmin,
    authController.requireRoomSelection, // NEW: Ensure room is selected
    async (req, res) => {
        try {
            const Quiz = require('../models/quiz.model');
            const roomCode = req.session.selectedRoom?.code;
            
            // Filter quizzes by selected room
            const quizzes = await Quiz.find({ 
                createdBy: req.user.id,
                roomCode: roomCode // Filter by room
            })
                .select('title mode language questions scheduleSettings createdAt updatedAt')
                .sort({ createdAt: -1 });

            const formattedQuizzes = quizzes.map(quiz => ({
                ...quiz.toObject(),
                questionCount: quiz.questions.length,
                completedCount: 0, // TODO: Implement completion tracking
                totalCount: 0,     // TODO: Implement participant counting
                formattedDate: new Date(quiz.updatedAt).toLocaleDateString()
            }));

            const roomInfo = req.session.selectedRoom;

            res.render('admin/dashboard', {
                title: `Admin Dashboard - ${authController.getRoomName(roomCode)}`,
                user: req.user,
                quizzes: formattedQuizzes,
                totalQuizzes: formattedQuizzes.length,
                roomInfo: roomInfo
            });
        } catch (error) {
            console.error('Admin dashboard error:', error);
            res.status(500).render('error/500', {
                title: 'Server Error',
                message: 'Unable to load dashboard'
            });
        }
    }
);

// ========================================
// API ROUTES FOR ROOM MANAGEMENT
// ========================================

// GET: Current room info API
router.get('/api/admin/current-room',
    authController.requireAuth,
    authController.requireAdmin,
    (req, res) => {
        const roomInfo = authController.getCurrentRoomInfo(req);
        if (roomInfo) {
            res.json({
                success: true,
                roomInfo: roomInfo
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'No room selected'
            });
        }
    }
);

// POST: Switch room (requires re-authentication)
router.post('/api/admin/switch-room',
    authController.requireAuth,
    authController.requireAdmin,
    (req, res) => {
        // Clear current room selection to force re-selection
        if (req.session) {
            delete req.session.selectedRoom;
        }
        
        res.json({
            success: true,
            message: 'Room selection cleared. Please select a new department.',
            redirectUrl: '/auth/admin/select-room'
        });
    }
);

// GET: Room statistics API
router.get('/api/admin/room-stats/:roomCode',
    authController.requireAuth,
    authController.requireAdmin,
    async (req, res) => {
        try {
            const QuizService = require('../services/quiz.service');
            const roomCode = req.params.roomCode || req.session.selectedRoom?.code;
            
            if (!roomCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Room code is required'
                });
            }

            const stats = await QuizService.getQuizStatsByRoom(roomCode);
            
            res.json({
                success: true,
                stats: stats
            });
        } catch (error) {
            console.error('Room stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch room statistics'
            });
        }
    }
);

// ========================================
// EXISTING PLAYER ROUTES (NO CHANGES)
// ========================================

// Player dashboard route (no room selection needed)
router.get('/player/dashboard',
    authController.requireAuth,
    authController.requirePlayer,
    async (req, res) => {
        try {
            const PlayerService = require('../services/player.service');
            const user = req.session.user;
            
            // Fetch player statistics
            const stats = await PlayerService.getPlayerStats(user.id);
            
            res.render('player/dashboard', {
                title: 'Player Dashboard',
                user: user,
                stats: stats,
                layout: false
            });
            
        } catch (error) {
            console.error('Player dashboard error:', error);
            res.status(500).render('error/500', {
                title: 'Server Error',
                message: 'Unable to load dashboard. Please try again later.',
                layout: false
            });
        }
    }
);

// ========================================
// UTILITY ROUTES
// ========================================

// Health check for room selection system
router.get('/api/admin/room-health',
    authController.requireAuth,
    authController.requireAdmin,
    (req, res) => {
        const roomInfo = req.session.selectedRoom;
        const health = {
            timestamp: new Date().toISOString(),
            userAuthenticated: !!req.session.user,
            roomSelected: !!roomInfo,
            roomInfo: roomInfo || null,
            sessionAge: req.session.user ? 
                Math.floor((new Date() - new Date(req.session.user.loginTime)) / 1000) : 0
        };
        
        res.json({
            success: true,
            health: health
        });
    }
);

module.exports = router;
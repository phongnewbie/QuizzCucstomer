const express = require('express');
const router = express.Router();
const QuizController = require('../controllers/quiz.controller');
const upload = require('../config/multer.config');
const { i18nMiddleware, languageSwitchMiddleware } = require('../middlewares/i18n.middleware');

// Apply i18n middleware to all routes
router.use(languageSwitchMiddleware);
router.use(i18nMiddleware);

// Add new route for rendering create page
router.get('/create', QuizController.renderCreateQuiz);

// Enhanced route for getting all quizzes (now includes enhanced data)
router.get('/', QuizController.getQuizzes);

// Existing routes
router.post('/', upload.any(), QuizController.createQuiz);
router.get('/:id', QuizController.getQuiz);
router.get('/:id/preview', QuizController.previewQuiz);
router.get('/:id/edit', QuizController.renderEditQuiz);
router.put('/:id', upload.any(), QuizController.updateQuiz);

// Enhanced delete route - using the enhanced method
router.delete('/:id', QuizController.deleteQuizEnhanced);

// New route for quiz duplication
router.post('/:id/duplicate', QuizController.duplicateQuiz);

// New route for analytics
router.get('/api/analytics', QuizController.getAnalytics);

module.exports = router;
const express = require('express');
const router = express.Router();
const TestController = require('../controllers/test.controller');
const { requireAuth, requireAdmin } = require('../controllers/auth.controller');
const { i18nMiddleware, languageSwitchMiddleware } = require('../middlewares/i18n.middleware');

// Apply i18n middleware to all routes
router.use(languageSwitchMiddleware);
router.use(i18nMiddleware);

// ========================================
// PUBLIC ROUTES (No authentication required)
// ========================================

// Join test by direct link
router.get('/join/:testCode', TestController.renderJoinPage);

// Test room (both admin and participant)
router.get('/room/:testCode', TestController.renderTestRoom);

// Test results (public after completion)
router.get('/results/:testCode', TestController.renderTestResults);

// API: Get test results
router.get('/api/results/:testCode', TestController.getTestResults);

// API: Get live test data
router.get('/api/data/:testCode', TestController.getTestData);

// ========================================
// AUTHENTICATED ROUTES
// ========================================

// Join test by code page (for authenticated users)
router.get('/join', requireAuth, TestController.renderJoinByCode);

// Validate test availability
router.post('/validate', TestController.validateTestAvailability);

// Validate and join test (legacy support)
router.post('/join', TestController.validateAndJoinTest);

// ========================================
// NEW: OFFLINE MODE ROUTES
// ========================================

// Submit offline answer
router.post('/submit-offline-answer', TestController.submitOfflineAnswer);

// Complete offline test
router.post('/complete-offline-test', TestController.completeOfflineTest);

// ========================================
// ADMIN ROUTES
// ========================================

// Create new test
router.post('/create', requireAuth, requireAdmin, TestController.createTest);

// Test results list (admin only)
router.get('/admin/results', requireAuth, requireAdmin, TestController.renderTestResultsList);

module.exports = router;
const User = require('../models/user.model');
const Quiz = require('../models/quiz.model');
const AuthService = require('../services/auth.service');

class AuthController {
    // GET login page
    getLoginPage = (req, res) => {
        // Check if user is already logged in
        if (req.session && req.session.user) {
            return this.redirectBasedOnRole(req, res);
        }
        
        res.render('auth/login', {
            title: req.t('auth:title'),
            layout: false,
            error: null,
            email: '',
            lng: req.language,
            // Pass all i18n helpers
            t: req.t,
            ti: res.locals.ti,
            formatDate: res.locals.formatDate,
            formatNumber: res.locals.formatNumber
        });
    };

    // POST login
    login = async (req, res) => {
        try {
            const { email, password, remember } = req.body;
            
            // Validate input
            if (!email || !password) {
                return res.render('auth/login', {
                    title: req.t('auth:title'),
                    layout: false,
                    error: req.t('validation:email_password_required'),
                    email: email || '',
                    lng: req.language,
                    t: req.t,
                    ti: res.locals.ti,
                    formatDate: res.locals.formatDate,
                    formatNumber: res.locals.formatNumber
                });
            }

            // Use AuthService with translation function
            const result = await AuthService.login(email, password, remember, req.t);
            
            if (!result.success) {
                return res.render('auth/login', {
                    title: req.t('auth:title'),
                    layout: false,
                    error: result.message,
                    email: email,
                    lng: req.language,
                    t: req.t,
                    ti: res.locals.ti,
                    formatDate: res.locals.formatDate,
                    formatNumber: res.locals.formatNumber
                });
            }

            // Store user in session
            req.session.user = result.user;

            // Configure session based on remember me
            if (remember) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            } else {
                req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours
            }

            // Log successful login
            console.log(`✅ ${req.t('auth:login_success')}: ${result.user.email} (${result.user.role})`);

            // Redirect based on user role
            return this.redirectBasedOnRole(req, res);

        } catch (error) {
            console.error('Login error:', error);
            res.render('auth/login', {
                title: req.t('auth:title'),
                layout: false,
                error: req.t('auth:login_failed'),
                email: req.body.email || '',
                lng: req.language,
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber
            });
        }
    };

    // Role-based redirection logic
    redirectBasedOnRole = async (req, res) => {
        try {
            const user = req.session.user;
            
            if (user.role === 'admin') {
                // Admin: Redirect to room selection
                return res.redirect('/auth/admin/select-room');
            } 
            else if (user.role === 'player') {
                // Player: Redirect to player dashboard
                return res.redirect('/player/dashboard');
            }
            else {
                // Invalid role - logout and redirect to login
                req.session.destroy();
                return res.redirect('/auth/login');
            }
        } catch (error) {
            console.error('Role-based redirection error:', error);
            res.redirect('/auth/login');
        }
    };

    // GET room selection page
    getRoomSelectionPage = (req, res) => {
        // Check authentication
        if (!req.session || !req.session.user) {
            return res.redirect('/auth/login');
        }

        // Check admin role
        if (req.session.user.role !== 'admin') {
            return res.redirect('/player/dashboard');
        }

        // Check if room already selected
        if (req.session.selectedRoom) {
            return res.redirect('/quizzes');
        }

        console.log('Rendering room selection page for admin');
        res.render('auth/room', {
            title: req.t('auth:select_room') + ' - ' + req.t('common:app_name'),
            user: req.session.user,
            layout: false,
            lng: req.language,
            // Pass all i18n helpers
            t: req.t,
            ti: res.locals.ti,
            formatDate: res.locals.formatDate,
            formatNumber: res.locals.formatNumber
        });
    };

    // POST room selection
    selectRoom = async (req, res) => {
        try { 
            const { selectedRoom, roomPassword } = req.body;

            // Validate input
            if (!selectedRoom || !roomPassword) {
                return res.status(400).json({
                    success: false,
                    message: req.t('auth:form_validation.department_required') + ' ' + req.t('auth:form_validation.access_code_required')
                });
            }

            // Validate password format (6 digits)
            if (!/^\d{6}$/.test(roomPassword)) {
                return res.status(400).json({
                    success: false,
                    message: req.t('auth:form_validation.access_code_format')
                });
            }

            // Use AuthService for room validation
            const result = await AuthService.validateRoomAccess(selectedRoom, roomPassword, req.t);
            
            if (!result.success) {
                return res.status(401).json({
                    success: false,
                    message: result.message
                });
            }

            // Store selected room in session
            req.session.selectedRoom = {
                code: result.roomCode,
                name: result.roomName,
                selectedAt: new Date()
            };

            // Log successful room selection
            console.log(`✅ User ${req.session.user.email} accessed ${result.roomCode.toUpperCase()} department at ${new Date().toISOString()}`);

            res.json({
                success: true,
                message: result.message,
                redirectUrl: '/quizzes'
            });

        } catch (error) {
            console.error('Room selection error:', error);
            res.status(500).json({
                success: false,
                message: req.t('auth:error_title')
            });
        }
    };

    // GET logout
    logout = async (req, res) => {
        try {
            if (req.session && req.session.user) {
                const userId = req.session.user.id;
                
                // Use AuthService for logout
                const result = await AuthService.logout(userId, req.t);
                
                // Destroy session
                req.session.destroy((err) => {
                    if (err) {
                        console.error('Session destruction error:', err);
                    }
                    res.clearCookie('connect.sid');
                    
                    // Log logout
                    console.log(`✅ ${result.message}: ${req.session?.user?.email || 'unknown'}`);
                    
                    res.redirect('/auth/login');
                });
            } else {
                res.redirect('/auth/login');
            }
        } catch (error) {
            console.error('Logout error:', error);
            res.redirect('/auth/login');
        }
    };

    // Middleware to check if user is authenticated
    requireAuth = async (req, res, next) => {
        try {
            if (!req.session || !req.session.user) {
                return res.redirect('/auth/login');
            }
            
            // Use AuthService for session validation
            const validation = await AuthService.validateSession(req.session, req.t);
            
            if (!validation.valid) {
                req.session.destroy();
                return res.redirect('/auth/login');
            }
            
            // Verify user still exists and is active
            const user = await User.findById(req.session.user.id);
            
            if (!user || !user.isActive) {
                req.session.destroy();
                return res.redirect('/auth/login');
            }
            
            // Add user to request object for use in routes
            req.user = req.session.user;
            next();
        } catch (error) {
            console.error('Auth middleware error:', error);
            res.redirect('/auth/login');
        }
    };

    // Middleware to check if admin has selected a room
    requireRoomSelection = (req, res, next) => {
        if (req.session.user.role !== 'admin') {
            return next(); // Players don't need room selection
        }

        if (!req.session.selectedRoom) {
            return res.redirect('/auth/admin/select-room');
        }

        // Add selected room to request object
        req.selectedRoom = req.session.selectedRoom;
        next();
    };

    // Middleware to check if user is admin (and has selected room)
    requireAdmin = (req, res, next) => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html lang="${req.language || 'en'}">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>403 - ${req.t('error:access_denied')}</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                    <style>
                        body { 
                            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-family: 'Inter', sans-serif;
                        }
                        .error-container { text-align: center; }
                        .error-code { font-size: 5rem; font-weight: bold; margin-bottom: 1rem; }
                        .btn-home { 
                            background: rgba(255,255,255,0.2);
                            border: 2px solid white;
                            color: white;
                            padding: 0.75rem 2rem;
                            border-radius: 50px;
                            text-decoration: none;
                            margin: 1rem 0.5rem;
                            display: inline-block;
                        }
                        .btn-home:hover { background: white; color: #f59e0b; }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <div class="error-code">403</div>
                        <h2>${req.t('error:access_denied')}</h2>
                        <p>${req.t('error:access_denied_desc')}</p>
                        <a href="/" class="btn-home">${req.t('common:go_home')}</a>
                        <a href="/auth/logout" class="btn-home">${req.t('common:logout')}</a>
                    </div>
                </body>
                </html>
            `);
        }

        // Check if admin has selected a room (exclude room selection page)
        if (req.path !== '/admin/select-room' && !req.session.selectedRoom) {
            return res.redirect('/auth/admin/select-room');
        }

        next();
    };

    // Middleware to check if user is player
    requirePlayer = (req, res, next) => {
        if (!req.user || req.user.role !== 'player') {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html lang="${req.language || 'en'}">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>403 - ${req.t('error:access_denied')}</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                    <style>
                        body { 
                            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-family: 'Inter', sans-serif;
                        }
                        .error-container { text-align: center; }
                        .error-code { font-size: 5rem; font-weight: bold; margin-bottom: 1rem; }
                        .btn-home { 
                            background: rgba(255,255,255,0.2);
                            border: 2px solid white;
                            color: white;
                            padding: 0.75rem 2rem;
                            border-radius: 50px;
                            text-decoration: none;
                            margin: 1rem 0.5rem;
                            display: inline-block;
                        }
                        .btn-home:hover { background: white; color: #f59e0b; }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <div class="error-code">403</div>
                        <h2>${req.t('error:access_denied')}</h2>
                        <p>${req.t('error:unauthorized_access_desc')}</p>
                        <a href="/" class="btn-home">${req.t('common:go_home')}</a>
                        <a href="/auth/logout" class="btn-home">${req.t('common:logout')}</a>
                    </div>
                </body>
                </html>
            `);
        }
        next();
    };

    // Register new user (if needed)
    register = async (req, res) => {
        try {
            const { name, email, password, role = 'player' } = req.body;
            
            // Check if user already exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: req.t('validation:user_exists')
                });
            }

            // Create new user
            const newUser = new User({
                name,
                email,
                password,
                role
            });

            await newUser.save();

            res.status(201).json({
                success: true,
                message: req.t('auth:user_registered'),
                user: {
                    user_id: newUser.user_id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role
                }
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                success: false,
                message: req.t('auth:registration_failed'),
                error: error.message
            });
        }
    };

    // Method to clear room selection (for testing or manual reset)
    clearRoomSelection = (req, res) => {
        if (req.session) {
            delete req.session.selectedRoom;
        }
        res.redirect('/auth/admin/select-room');
    };

    // Get current room info (for templates)
    getCurrentRoomInfo = (req) => {
        if (req.session && req.session.selectedRoom) {
            return {
                code: req.session.selectedRoom.code,
                name: req.session.selectedRoom.name,
                selectedAt: req.session.selectedRoom.selectedAt
            };
        }
        return null;
    };

    // Helper method to get room name
    getRoomName = (roomCode) => {
        const roomNames = {
            'hrm': 'Human Resource Management',
            'hse': 'Health, Safety & Environment',
            'gm': 'General Management',
            'qasx': 'Quality Assurance - Production',
            'sm': 'Sales Marketing'
        };
        return roomNames[roomCode] || roomCode.toUpperCase();
    };
}

module.exports = new AuthController();
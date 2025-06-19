// services/auth.service.js
const User = require('../models/user.model');

class AuthService {
    async login(email, password, remember = false, t = null) {
        try {
            // Default translation function if not provided
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'auth:invalid_credentials': 'Invalid email or password',
                    'auth:account_deactivated': 'Your account has been deactivated. Please contact support.',
                    'auth:login_error': 'An error occurred during login'
                };
                let message = messages[key] || key;
                // Simple placeholder replacement
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            // First, try to find user in database
            let user = await User.findByEmail(email);
            
            if (user && user.isActive) {
                // Check password
                const isPasswordValid = await user.comparePassword(password);
                
                if (isPasswordValid) {
                    // Update last login
                    await user.updateLastLogin();
                    
                    return {
                        success: true,
                        user: {
                            id: user._id,
                            user_id: user.user_id,
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            loginTime: new Date(),
                            rememberMe: remember
                        }
                    };
                }
            }
            
            // Check if user exists but inactive
            if (user && !user.isActive) {
                return {
                    success: false,
                    message: translate('auth:account_deactivated'),
                    translationKey: 'auth:account_deactivated'
                };
            }
            
            // Fallback to hardcoded credentials for development
            const validCredentials = [
                { email: 'admin@quizapp.com', password: 'admin123', name: 'Admin User', role: 'admin' },
                { email: 'admin1@quizapp.com', password: 'admin123', name: 'Admin User 1', role: 'admin' },
                { email: 'admin2@quizapp.com', password: 'admin123', name: 'Admin User 2', role: 'admin' }
            ];
            
            const hardcodedUser = validCredentials.find(
                cred => cred.email.toLowerCase() === email.toLowerCase() && cred.password === password
            );
            
            if (hardcodedUser) {
                // Create user in database if doesn't exist
                try {
                    let dbUser = await User.findByEmail(hardcodedUser.email);
                    if (!dbUser) {
                        const result = await User.createUser({
                            name: hardcodedUser.name,
                            email: hardcodedUser.email,
                            password: hardcodedUser.password,
                            role: hardcodedUser.role
                        });
                        
                        if (result.success) {
                            dbUser = result.user;
                        } else {
                            console.error('Error creating user in DB:', result.message);
                            // Return hardcoded user data if DB creation fails
                            return {
                                success: true,
                                user: {
                                    id: Date.now(),
                                    user_id: Date.now(),
                                    name: hardcodedUser.name,
                                    email: hardcodedUser.email,
                                    role: hardcodedUser.role,
                                    loginTime: new Date(),
                                    rememberMe: remember
                                }
                            };
                        }
                    }
                    
                    await dbUser.updateLastLogin();
                    
                    return {
                        success: true,
                        user: {
                            id: dbUser._id,
                            user_id: dbUser.user_id,
                            name: dbUser.name,
                            email: dbUser.email,
                            role: dbUser.role,
                            loginTime: new Date(),
                            rememberMe: remember
                        }
                    };
                } catch (dbError) {
                    console.error('Database user creation error:', dbError);
                    // Return hardcoded user data even if DB save fails
                    return {
                        success: true,
                        user: {
                            id: Date.now(),
                            user_id: Date.now(),
                            name: hardcodedUser.name,
                            email: hardcodedUser.email,
                            role: hardcodedUser.role,
                            loginTime: new Date(),
                            rememberMe: remember
                        }
                    };
                }
            }
            
            return {
                success: false,
                message: translate('auth:invalid_credentials'),
                translationKey: 'auth:invalid_credentials'
            };
            
        } catch (error) {
            console.error('Login error:', error);
            const translate = t || ((key) => key);
            return {
                success: false,
                message: translate('auth:login_error'),
                translationKey: 'auth:login_error',
                error: error.message
            };
        }
    }
    
    async logout(userId, t = null) {
        try {
            const translate = t || ((key) => {
                const messages = {
                    'auth:logout_success': 'Logged out successfully',
                    'auth:logout_error': 'An error occurred during logout'
                };
                return messages[key] || key;
            });

            // In a real application, you might want to:
            // - Clear session data from database
            // - Invalidate tokens
            // - Log the logout event
            
            return {
                success: true,
                message: translate('auth:logout_success'),
                translationKey: 'auth:logout_success'
            };
        } catch (error) {
            console.error('Logout error:', error);
            const translate = t || ((key) => key);
            return {
                success: false,
                message: translate('auth:logout_error'),
                translationKey: 'auth:logout_error'
            };
        }
    }
    
    async validateSession(sessionData, t = null) {
        try {
            const translate = t || ((key) => {
                const messages = {
                    'auth:no_session': 'No session found',
                    'auth:session_expired': 'Session expired',
                    'auth:session_validation_failed': 'Session validation failed'
                };
                return messages[key] || key;
            });

            // Basic session validation
            if (!sessionData || !sessionData.user) {
                return { 
                    valid: false, 
                    message: translate('auth:no_session'),
                    translationKey: 'auth:no_session'
                };
            }
            
            // Check if session is expired (optional)
            const sessionAge = Date.now() - new Date(sessionData.user.loginTime).getTime();
            const maxAge = sessionData.user.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 days or 1 day
            
            if (sessionAge > maxAge) {
                return { 
                    valid: false, 
                    message: translate('auth:session_expired'),
                    translationKey: 'auth:session_expired'
                };
            }
            
            return { valid: true, user: sessionData.user };
        } catch (error) {
            console.error('Session validation error:', error);
            const translate = t || ((key) => key);
            return { 
                valid: false, 
                message: translate('auth:session_validation_failed'),
                translationKey: 'auth:session_validation_failed'
            };
        }
    }

    // Method to create initial admin user
    async createInitialAdmin(t = null) {
        try {
            const translate = t || ((key) => {
                const messages = {
                    'auth:admin_created': 'Initial admin user created',
                    'auth:admin_exists': 'Admin user already exists',
                    'auth:admin_creation_failed': 'Failed to create initial admin'
                };
                return messages[key] || key;
            });

            const adminExists = await User.findOne({ role: 'admin' });
            
            if (!adminExists) {
                console.log('🔧 Creating initial admin user...');
                
                const result = await User.createUser({
                    name: 'System Administrator',
                    email: 'admin@quizapp.com',
                    password: 'admin123', // Change this in production
                    role: 'admin'
                });
                
                if (result.success) {
                    console.log('✅ Initial admin user created: admin@quizapp.com / admin123');
                    return {
                        success: true,
                        user: result.user,
                        message: translate('auth:admin_created'),
                        translationKey: 'auth:admin_created'
                    };
                } else {
                    console.error('❌ Failed to create initial admin:', result.message);
                    return {
                        success: false,
                        message: translate('auth:admin_creation_failed'),
                        translationKey: 'auth:admin_creation_failed'
                    };
                }
            } else {
                console.log('✅ Admin user already exists');
                return {
                    success: true,
                    user: adminExists,
                    message: translate('auth:admin_exists'),
                    translationKey: 'auth:admin_exists'
                };
            }
        } catch (error) {
            console.error('❌ Error creating initial admin:', error);
            const translate = t || ((key) => key);
            return {
                success: false,
                message: translate('auth:admin_creation_failed'),
                translationKey: 'auth:admin_creation_failed',
                error: error.message
            };
        }
    }

    // Method to create initial demo users
    async createInitialUsers(t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'auth:demo_user_created': 'Demo user created: {{email}}',
                    'auth:demo_users_setup_complete': 'Demo users setup completed',
                    'auth:demo_users_setup_failed': 'Failed to setup demo users'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const demoUsers = [
                { name: 'System Administrator', email: 'admin@quizapp.com', password: 'admin123', role: 'admin' },
                { name: 'Admin User 1', email: 'admin1@quizapp.com', password: 'admin123', role: 'admin' },
                { name: 'Admin User 2', email: 'admin2@quizapp.com', password: 'admin123', role: 'admin' },
                { name: 'Teacher User', email: 'teacher@quizapp.com', password: 'teacher123', role: 'admin' },
                { name: 'Demo User', email: 'demo@demo.com', password: 'demo123', role: 'admin' },
                { name: 'Demo Player', email: 'player@demo.com', password: 'player123', role: 'player' }
            ];

            let createdCount = 0;
            for (const userData of demoUsers) {
                const existingUser = await User.findByEmail(userData.email);
                if (!existingUser) {
                    const result = await User.createUser(userData);
                    if (result.success) {
                        console.log(`✅ ${translate('auth:demo_user_created', { email: userData.email })}`);
                        createdCount++;
                    }
                }
            }

            return {
                success: true,
                createdCount,
                message: translate('auth:demo_users_setup_complete'),
                translationKey: 'auth:demo_users_setup_complete'
            };
        } catch (error) {
            console.error('Error creating demo users:', error);
            const translate = t || ((key) => key);
            return {
                success: false,
                message: translate('auth:demo_users_setup_failed'),
                translationKey: 'auth:demo_users_setup_failed',
                error: error.message
            };
        }
    }

    // New method to validate room access
    async validateRoomAccess(roomCode, password, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'auth:invalid_room_code': 'Invalid room code',
                    'auth:invalid_room_password': 'Invalid access code for the selected department',
                    'auth:room_access_granted': 'Access granted to {{roomName}} department',
                    'auth:room_validation_failed': 'Room validation failed'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            // Room passwords
            const ROOM_PASSWORDS = {
                'hrm': '123456',
                'hse': '234567',
                'gm': '345678',
                'qasx': '345678',
                'sm': '345678'
            };

            // Room names
            const ROOM_NAMES = {
                'hrm': 'Human Resource Management',
                'hse': 'Health, Safety & Environment',
                'gm': 'General Management',
                'qasx': 'Quality Assurance - Production',
                'sm': 'Sales Marketing'
            };

            if (!ROOM_PASSWORDS.hasOwnProperty(roomCode)) {
                return {
                    success: false,
                    message: translate('auth:invalid_room_code'),
                    translationKey: 'auth:invalid_room_code'
                };
            }

            if (ROOM_PASSWORDS[roomCode] !== password) {
                return {
                    success: false,
                    message: translate('auth:invalid_room_password'),
                    translationKey: 'auth:invalid_room_password'
                };
            }

            return {
                success: true,
                roomCode,
                roomName: ROOM_NAMES[roomCode],
                message: translate('auth:room_access_granted', { roomName: ROOM_NAMES[roomCode] }),
                translationKey: 'auth:room_access_granted'
            };

        } catch (error) {
            console.error('Room validation error:', error);
            const translate = t || ((key) => key);
            return {
                success: false,
                message: translate('auth:room_validation_failed'),
                translationKey: 'auth:room_validation_failed',
                error: error.message
            };
        }
    }
}

module.exports = new AuthService();
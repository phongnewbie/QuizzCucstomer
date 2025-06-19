// services/player.service.js
const User = require('../models/user.model');

class PlayerService {
    /**
     * Get player dashboard statistics
     * @param {string} userId - User ID
     * @returns {Object} Player statistics
     */
    async getPlayerStats(userId) {
        try {
            // TODO: Implement actual database queries
            // These would typically come from a QuizResult or UserStats model
            
            const stats = {
                quizzesCompleted: 0,
                averageScore: 0,
                activeStreaks: 0,
                totalPoints: 0,
                rank: null,
                totalPlayers: 0,
                lastQuizDate: null
            };

            // Example implementation (replace with actual database queries):
            /*
            const QuizResult = require('../models/quiz-result.model');
            
            // Get total quizzes completed
            stats.quizzesCompleted = await QuizResult.countDocuments({ 
                userId: userId,
                completed: true 
            });
            
            // Calculate average score
            const scoreResults = await QuizResult.aggregate([
                { $match: { userId: userId, completed: true } },
                { $group: { _id: null, avgScore: { $avg: "$score" } } }
            ]);
            stats.averageScore = scoreResults.length > 0 ? Math.round(scoreResults[0].avgScore) : 0;
            
            // Get total points
            const pointsResults = await QuizResult.aggregate([
                { $match: { userId: userId, completed: true } },
                { $group: { _id: null, totalPoints: { $sum: "$points" } } }
            ]);
            stats.totalPoints = pointsResults.length > 0 ? pointsResults[0].totalPoints : 0;
            
            // Calculate current streak
            stats.activeStreaks = await this.calculateCurrentStreak(userId);
            
            // Get player rank
            stats.rank = await this.getPlayerRank(userId);
            stats.totalPlayers = await User.countDocuments({ role: 'player' });
            
            // Get last quiz date
            const lastQuiz = await QuizResult.findOne(
                { userId: userId, completed: true },
                {},
                { sort: { completedAt: -1 } }
            );
            stats.lastQuizDate = lastQuiz ? lastQuiz.completedAt : null;
            */

            return stats;
        } catch (error) {
            console.error('Error fetching player stats:', error);
            throw new Error('Failed to fetch player statistics');
        }
    }

    /**
     * Get player's recent quiz history
     * @param {string} userId - User ID
     * @param {number} limit - Number of recent quizzes to fetch
     * @returns {Array} Recent quiz results
     */
    async getRecentQuizzes(userId, limit = 10) {
        try {
            // TODO: Implement actual database query
            const recentQuizzes = [];

            // Example implementation:
            /*
            const QuizResult = require('../models/quiz-result.model');
            
            recentQuizzes = await QuizResult.find({ userId: userId })
                .populate('quizId', 'title mode language')
                .sort({ completedAt: -1 })
                .limit(limit)
                .lean();
                
            // Format the data for frontend
            return recentQuizzes.map(quiz => ({
                id: quiz._id,
                quizTitle: quiz.quizId.title,
                score: quiz.score,
                totalQuestions: quiz.totalQuestions,
                correctAnswers: quiz.correctAnswers,
                completedAt: quiz.completedAt,
                duration: quiz.duration,
                rank: quiz.rank,
                mode: quiz.quizId.mode,
                language: quiz.quizId.language
            }));
            */

            return recentQuizzes;
        } catch (error) {
            console.error('Error fetching recent quizzes:', error);
            throw new Error('Failed to fetch recent quiz history');
        }
    }

    /**
     * Get player's achievements
     * @param {string} userId - User ID
     * @returns {Array} Player achievements
     */
    async getPlayerAchievements(userId) {
        try {
            // TODO: Implement achievement system
            const achievements = [];

            // Example achievements structure:
            /*
            const Achievement = require('../models/achievement.model');
            const UserAchievement = require('../models/user-achievement.model');
            
            achievements = await UserAchievement.find({ userId: userId })
                .populate('achievementId')
                .sort({ earnedAt: -1 })
                .lean();
                
            return achievements.map(ua => ({
                id: ua.achievementId._id,
                name: ua.achievementId.name,
                description: ua.achievementId.description,
                icon: ua.achievementId.icon,
                category: ua.achievementId.category,
                rarity: ua.achievementId.rarity,
                earnedAt: ua.earnedAt,
                progress: ua.progress || 100
            }));
            */

            return achievements;
        } catch (error) {
            console.error('Error fetching player achievements:', error);
            throw new Error('Failed to fetch player achievements');
        }
    }

    /**
     * Calculate player's current quiz streak
     * @param {string} userId - User ID
     * @returns {number} Current streak count
     */
    async calculateCurrentStreak(userId) {
        try {
            // TODO: Implement streak calculation
            let currentStreak = 0;

            // Example implementation:
            /*
            const QuizResult = require('../models/quiz-result.model');
            
            const recentQuizzes = await QuizResult.find(
                { userId: userId, completed: true },
                { score: 1, completedAt: 1 },
                { sort: { completedAt: -1 } }
            );
            
            // Calculate consecutive days with completed quizzes
            let currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0);
            
            for (const quiz of recentQuizzes) {
                const quizDate = new Date(quiz.completedAt);
                quizDate.setHours(0, 0, 0, 0);
                
                const daysDiff = Math.floor((currentDate - quizDate) / (1000 * 60 * 60 * 24));
                
                if (daysDiff === currentStreak) {
                    currentStreak++;
                    currentDate.setDate(currentDate.getDate() - 1);
                } else if (daysDiff > currentStreak) {
                    break;
                }
            }
            */

            return currentStreak;
        } catch (error) {
            console.error('Error calculating current streak:', error);
            return 0;
        }
    }

    /**
     * Get player's rank among all players
     * @param {string} userId - User ID
     * @returns {number|null} Player rank (1-based) or null if no rank
     */
    async getPlayerRank(userId) {
        try {
            // TODO: Implement ranking system
            let rank = null;

            // Example implementation:
            /*
            const QuizResult = require('../models/quiz-result.model');
            
            // Calculate total points for all players
            const playerRankings = await QuizResult.aggregate([
                { $match: { completed: true } },
                { $group: { 
                    _id: "$userId", 
                    totalPoints: { $sum: "$points" },
                    averageScore: { $avg: "$score" },
                    quizzesCompleted: { $sum: 1 }
                }},
                { $sort: { 
                    totalPoints: -1, 
                    averageScore: -1, 
                    quizzesCompleted: -1 
                }}
            ]);
            
            // Find user's rank
            const userRankIndex = playerRankings.findIndex(p => p._id.toString() === userId.toString());
            rank = userRankIndex >= 0 ? userRankIndex + 1 : null;
            */

            return rank;
        } catch (error) {
            console.error('Error calculating player rank:', error);
            return null;
        }
    }

    /**
     * Get leaderboard data
     * @param {number} limit - Number of top players to return
     * @returns {Array} Leaderboard data
     */
    async getLeaderboard(limit = 10) {
        try {
            // TODO: Implement leaderboard
            const leaderboard = [];

            // Example implementation:
            /*
            const QuizResult = require('../models/quiz-result.model');
            
            leaderboard = await QuizResult.aggregate([
                { $match: { completed: true } },
                { $group: { 
                    _id: "$userId", 
                    totalPoints: { $sum: "$points" },
                    averageScore: { $avg: "$score" },
                    quizzesCompleted: { $sum: 1 }
                }},
                { $sort: { 
                    totalPoints: -1, 
                    averageScore: -1, 
                    quizzesCompleted: -1 
                }},
                { $limit: limit },
                { $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }},
                { $unwind: '$user' },
                { $project: {
                    userId: '$_id',
                    name: '$user.name',
                    totalPoints: 1,
                    averageScore: { $round: ['$averageScore', 1] },
                    quizzesCompleted: 1
                }}
            ]);
            */

            return leaderboard;
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            throw new Error('Failed to fetch leaderboard data');
        }
    }

    /**
     * Update player profile
     * @param {string} userId - User ID
     * @param {Object} updateData - Data to update
     * @returns {Object} Updated user data
     */
    async updatePlayerProfile(userId, updateData) {
        try {
            const allowedFields = ['name', 'email', 'preferences'];
            const filteredData = {};
            
            // Only allow specific fields to be updated
            allowedFields.forEach(field => {
                if (updateData[field] !== undefined) {
                    filteredData[field] = updateData[field];
                }
            });

            const updatedUser = await User.findByIdAndUpdate(
                userId,
                filteredData,
                { new: true, runValidators: true }
            ).select('-password');

            if (!updatedUser) {
                throw new Error('User not found');
            }

            return updatedUser;
        } catch (error) {
            console.error('Error updating player profile:', error);
            throw new Error('Failed to update player profile');
        }
    }

    /**
     * Get player's quiz analytics
     * @param {string} userId - User ID
     * @param {number} days - Number of days to analyze (default: 30)
     * @returns {Object} Analytics data
     */
    async getPlayerAnalytics(userId, days = 30) {
        try {
            // TODO: Implement analytics
            const analytics = {
                performance: {
                    trend: 'stable', // 'improving', 'declining', 'stable'
                    scoreHistory: [],
                    weakAreas: [],
                    strongAreas: []
                },
                activity: {
                    dailyQuizzes: [],
                    totalTime: 0,
                    averageTime: 0,
                    mostActiveDay: null,
                    streakData: []
                }
            };

            // Example implementation would fetch and analyze quiz results
            // over the specified time period

            return analytics;
        } catch (error) {
            console.error('Error fetching player analytics:', error);
            throw new Error('Failed to fetch player analytics');
        }
    }
}

module.exports = new PlayerService();
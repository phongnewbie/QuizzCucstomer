const mongoose = require('mongoose');
const argon2 = require('argon2');

// User schema
const userSchema = new mongoose.Schema({
    user_id: {
        type: Number,
        unique: true
        // Note: Removed 'required: true' to let pre-save middleware handle it
    },
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters long'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please enter a valid email address'
        ]
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long']
    },
    role: {
        type: String,
        required: [true, 'Role is required'],
        enum: {
            values: ['admin', 'player'],
            message: 'Role must be either admin or player'
        },
        default: 'player'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    profileImage: {
        type: String,
        default: null
    }
}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

// Function to get next user_id
async function getNextUserId() {
    try {
        // Try to find the highest user_id and increment
        const lastUser = await mongoose.model('User').findOne({}, {}, { sort: { 'user_id': -1 } });
        if (lastUser && lastUser.user_id) {
            return lastUser.user_id + 1;
        } else {
            return 1000; // Start from 1000 for user IDs
        }
    } catch (error) {
        console.error('Error getting next user_id:', error);
        // Fallback to timestamp-based ID
        return Date.now() % 1000000;
    }
}

// Pre-save middleware to auto-increment user_id
userSchema.pre('save', async function(next) {
    if (this.isNew && !this.user_id) {
        try {
            this.user_id = await getNextUserId();
            console.log(`✅ Auto-generated user_id: ${this.user_id} for ${this.email}`);
        } catch (error) {
            console.error('Error generating user_id:', error);
            // Fallback: use timestamp-based ID
            this.user_id = Date.now() % 1000000;
            console.log(`⚠️ Using fallback user_id: ${this.user_id} for ${this.email}`);
        }
    }
    next();
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) return next();
    
    try {
        // Hash password with cost of 12
        const saltRounds = 12;
        this.password = await argon2.hash(this.password);
        next();
    } catch (error) {
        console.error('Password hashing error:', error);
        next(error);
    }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await argon2.verify(this.password, candidatePassword);
    } catch (error) {
        console.error('Password comparison error:', error);
        return false;
    }
};

// Instance method to update last login
userSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
};

// Static method to find by email
userSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase() });
};

// Static method to find active users by role
userSchema.statics.findActiveByRole = function(role) {
    return this.find({ role, isActive: true });
};

// Static method to create user safely
userSchema.statics.createUser = async function(userData) {
    try {
        const user = new this(userData);
        await user.save();
        return { success: true, user };
    } catch (error) {
        if (error.code === 11000) {
            // Duplicate key error
            if (error.keyPattern.email) {
                return { success: false, message: 'Email already exists' };
            }
            if (error.keyPattern.user_id) {
                return { success: false, message: 'User ID conflict, please try again' };
            }
        }
        return { success: false, message: error.message };
    }
};

// Virtual for user display name (for UI purposes)
userSchema.virtual('displayName').get(function() {
    return this.name || this.email.split('@')[0];
});

// Ensure virtual fields are serialized
userSchema.set('toJSON', {
    virtuals: true,
    transform: function(doc, ret) {
        delete ret.password; // Remove password from JSON output
        delete ret.__v;
        return ret;
    }
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ user_id: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
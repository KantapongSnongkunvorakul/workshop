const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true,
        enum: ['User', 'Admin'],
        default: 'User'
    },
    age: {
        type: Number,
        min: 0
    },
    imageFilename: {
        type: String
    },
    isApproved: {
        type: Boolean,
        required: true,
        default: false  
    }
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);

module.exports = User;
const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  foodCategory: {
    type: String,
    required: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      role: {
        type: String,
        enum: ['host', 'participant'],
        default: 'participant'
      }
    }
  ],
  status: {
    type: String,
    enum: ['matching', 'confirmed'],
    default: 'matching'
  },
  confirmedTime: {
    type: String,
    default: ''
  },
  confirmedRestaurant: {
    name: String,
    category: String,
    distance: String,
    menu: String,
    emoji: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Room', RoomSchema);

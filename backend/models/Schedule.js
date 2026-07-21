const mongoose = require('mongoose');

const ScheduleSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  // Store free slots as array of strings, e.g., ["월-3", "수-3"]
  freeSlots: [
    {
      type: String
    }
  ],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure a user has one schedule record per room
ScheduleSchema.index({ user: 1, room: 1 }, { unique: true });

module.exports = mongoose.model('Schedule', ScheduleSchema);

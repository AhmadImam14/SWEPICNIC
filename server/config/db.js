const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing. Please set it in your .env file and restart the server.');
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log(`MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

if (process.env.NODE_ENV === 'test') {
  const { MongoMemoryServer } = require('mongodb-memory-server');

  module.exports = async () => {
    const memoryServer = await MongoMemoryServer.create();
    const uri = memoryServer.getUri();
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log(`MongoDB test server connected: ${uri}`);
    return mongoose.connection;
  };
} else {
  module.exports = connectDB;
}

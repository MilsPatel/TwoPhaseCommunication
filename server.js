// Fixed Backend Server - 2-Phase Commit E-commerce System
// This works with standalone MongoDB (no replica set required)

const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const MONGODB_URI = 'mongodb://localhost:27017';
const DATABASE_NAME = 'ecommerce_2pc';

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

class TwoPhaseCommitSystem {
    constructor() {
        this.client = null;
        this.db = null;
    }

    async connect() {
        try {
            this.client = new MongoClient(MONGODB_URI);
            await this.client.connect();
            this.db = this.client.db(DATABASE_NAME);
            console.log('✅ Connected to MongoDB');
            await this.initializeSampleData();
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    async initializeSampleData() {
        const users = this.db.collection('users');
        const products = this.db.collection('products');
        const orders = this.db.collection('orders');
        const transactions = this.db.collection('transactions');

        // Clear existing data
        await Promise.all([
            users.deleteMany({}),
            products.deleteMany({}),
            orders.deleteMany({}),
            transactions.deleteMany({})
        ]);

        // Insert sample users
        await users.insertMany([
            { _id: 'user1', name: 'John Doe', balance: 1000 },
            { _id: 'user2', name: 'Jane Smith', balance: 500 },
            { _id: 'user3', name: 'Mike Johnson', balance: 200 }
        ]);

        // Insert sample products
        await products.insertMany([
            { _id: 'prod1', name: 'Laptop', price: 800, stock: 5 },
            { _id: 'prod2', name: 'Mouse', price: 25, stock: 10 },
            { _id: 'prod3', name: 'Keyboard', price: 75, stock: 8 },
            { _id: 'prod4', name: 'Monitor', price: 300, stock: 3 }
        ]);

        console.log('📦 Sample data initialized');
    }

    async getCurrentState() {
        const users = await this.db.collection('users').find({}).toArray();
        const products = await this.db.collection('products').find({}).toArray();
        const orders = await this.db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
        const transactions = await this.db.collection('transactions').find({}).sort({ preparedAt: -1 }).toArray();

        return { users, products, orders, transactions };
    }

    // PHASE 1: PREPARE - Check if all operations can be performed
    async prepareTransaction(userId, productId, quantity) {
        const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const steps = [];

        try {
            steps.push({ step: 'PHASE_1_START', message: '🔄 Starting Phase 1: PREPARE', success: true });

            // Get current data (simulating locks in a real system)
            const users = this.db.collection('users');
            const products = this.db.collection('products');
            const transactions = this.db.collection('transactions');

            // PARTICIPANT 1: Check user exists and has sufficient balance
            const user = await users.findOne({ _id: userId });
            if (!user) {
                throw new Error(`User ${userId} not found`);
            }
            steps.push({ step: 'USER_CHECK', message: `✅ User ${user.name} found`, success: true });

            // PARTICIPANT 2: Check product exists and has sufficient stock
            const product = await products.findOne({ _id: productId });
            if (!product) {
                throw new Error(`Product ${productId} not found`);
            }
            steps.push({ step: 'PRODUCT_CHECK', message: `✅ Product ${product.name} found`, success: true });

            const totalCost = product.price * quantity;

            // PARTICIPANT 1: Balance Check
            if (user.balance < totalCost) {
                throw new Error(`Insufficient balance. Required: $${totalCost}, Available: $${user.balance}`);
            }
            steps.push({ 
                step: 'BALANCE_CHECK', 
                message: `✅ Balance check passed: $${user.balance} >= $${totalCost}`, 
                success: true 
            });

            // PARTICIPANT 2: Stock Check
            if (product.stock < quantity) {
                throw new Error(`Insufficient stock. Required: ${quantity}, Available: ${product.stock}`);
            }
            steps.push({ 
                step: 'STOCK_CHECK', 
                message: `✅ Stock check passed: ${product.stock} >= ${quantity}`, 
                success: true 
            });

            // PARTICIPANT 3: Create pending transaction record
            const transactionRecord = {
                _id: transactionId,
                userId,
                productId,
                quantity,
                totalCost,
                status: 'PREPARED',
                preparedAt: new Date(),
                expiresAt: new Date(Date.now() + 300000), // 5 minutes timeout
                userSnapshot: { balance: user.balance },
                productSnapshot: { stock: product.stock }
            };

            await transactions.insertOne(transactionRecord);
            steps.push({ 
                step: 'TRANSACTION_PREPARED', 
                message: `✅ Transaction ${transactionId} prepared successfully`, 
                success: true 
            });

            steps.push({ step: 'PHASE_1_COMPLETE', msesage: '🎉 Phase 1 COMPLETE - All participants voted YES!', success: true });
            
            return { success: true, transactionId, steps, phase: 1 };

        } catch (error) {
            steps.push({ 
                step: 'PHASE_1_FAILED', 
                message: `❌ Phase 1 FAILED: ${error.message}`, 
                success: false 
            });
            
            return { success: false, error: error.message, steps, phase: 1 };
        }
    }

    // PHASE 2: COMMIT - Execute the actual operations
    async commitTransaction(transactionId) {
        const steps = [];

        try {
            steps.push({ step: 'PHASE_2_START', message: '🔄 Starting Phase 2: COMMIT', success: true });

            const users = this.db.collection('users');
            const products = this.db.collection('products');
            const orders = this.db.collection('orders');
            const transactions = this.db.collection('transactions');

            // Get the prepared transaction
            const transaction = await transactions.findOne({ _id: transactionId, status: 'PREPARED' });

            if (!transaction) {
                throw new Error(`Transaction ${transactionId} not found or not in PREPARED state`);
            }

            if (new Date() > transaction.expiresAt) {
                throw new Error(`Transaction ${transactionId} has expired`);
            }

            // Double-check that resources haven't changed since prepare
            const currentUser = await users.findOne({ _id: transaction.userId });
            const currentProduct = await products.findOne({ _id: transaction.productId });

            if (currentUser.balance !== transaction.userSnapshot.balance) {
                throw new Error(`User balance changed since prepare phase`);
            }

            if (currentProduct.stock !== transaction.productSnapshot.stock) {
                throw new Error(`Product stock changed since prepare phase`);
            }

            // PARTICIPANT 1: Deduct user balance
            const userUpdateResult = await users.updateOne(
                { _id: transaction.userId, balance: transaction.userSnapshot.balance }, // Ensure balance hasn't changed
                { $inc: { balance: -transaction.totalCost } }
            );
            
            if (userUpdateResult.matchedCount === 0) {
                throw new Error(`Failed to update user ${transaction.userId} - balance may have changed`);
            }
            steps.push({ 
                step: 'BALANCE_DEDUCTED', 
                message: `✅ Deducted $${transaction.totalCost} from user balance`, 
                success: true 
            });

            // PARTICIPANT 2: Reduce product stock
            const productUpdateResult = await products.updateOne(
                { _id: transaction.productId, stock: transaction.productSnapshot.stock }, // Ensure stock hasn't changed
                { $inc: { stock: -transaction.quantity } }
            );

            if (productUpdateResult.matchedCount === 0) {
                // Rollback user balance
                await users.updateOne(
                    { _id: transaction.userId },
                    { $inc: { balance: transaction.totalCost } }
                );
                throw new Error(`Failed to update product ${transaction.productId} - stock may have changed`);
            }
            steps.push({ 
                step: 'STOCK_REDUCED', 
                message: `✅ Reduced stock by ${transaction.quantity}`, 
                success: true 
            });

            // PARTICIPANT 3: Create order record
            const orderId = `order_${Date.now()}`;
            await orders.insertOne({
                _id: orderId,
                userId: transaction.userId,
                productId: transaction.productId,
                quantity: transaction.quantity,
                totalCost: transaction.totalCost,
                status: 'COMPLETED',
                createdAt: new Date()
            });
            steps.push({ 
                step: 'ORDER_CREATED', 
                message: `✅ Order ${orderId} created successfully`, 
                success: true 
            });

            // Update transaction status to committed
            await transactions.updateOne(
                { _id: transactionId },
                { 
                    $set: { 
                        status: 'COMMITTED', 
                        committedAt: new Date(),
                        orderId: orderId
                    } 
                }
            );

            steps.push({ step: 'PHASE_2_COMPLETE', message: '🎉 Phase 2 COMPLETE - Transaction committed successfully!', success: true });
            
            return { success: true, orderId, steps, phase: 2 };

        } catch (error) {
            steps.push({ 
                step: 'PHASE_2_FAILED', 
                message: `❌ Phase 2 FAILED: ${error.message}`, 
                success: false 
            });
            
            // Mark transaction as aborted
            await this.abortTransaction(transactionId);
            
            return { success: false, error: error.message, steps, phase: 2 };
        }
    }

    async abortTransaction(transactionId) {
        try {
            const transactions = this.db.collection('transactions');
            await transactions.updateOne(
                { _id: transactionId },
                { 
                    $set: { 
                        status: 'ABORTED', 
                        abortedAt: new Date() 
                    } 
                }
            );
        } catch (error) {
            console.error('Error aborting transaction:', error.message);
        }
    }
}

// Initialize the system
const system = new TwoPhaseCommitSystem();

// API Routes

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get current system state
app.get('/api/state', async (req, res) => {
    try {
        const state = await system.getCurrentState();
        res.json(state);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Process order using 2PC
app.post('/api/process-order', async (req, res) => {
    try {
        const { userId, productId, quantity } = req.body;
        
        // Input validation
        if (!userId || !productId || !quantity || quantity <= 0) {
            return res.status(400).json({ 
                error: 'Invalid input. Please provide userId, productId, and positive quantity.' 
            });
        }

        // Phase 1: Prepare
        console.log(`\n🔄 Starting 2PC for User: ${userId}, Product: ${productId}, Quantity: ${quantity}`);
        const prepareResult = await system.prepareTransaction(userId, productId, quantity);
        
        if (!prepareResult.success) {
            console.log('❌ Phase 1 failed:', prepareResult.error);
            return res.json({
                success: false,
                phase1: prepareResult,
                message: 'Order failed in Phase 1 (PREPARE)'
            });
        }

        console.log('✅ Phase 1 succeeded, proceeding to Phase 2');
        
        // Add small delay to simulate network/processing time
        await new Promise(resolve => setTimeout(resolve, 500));

        // Phase 2: Commit
        const commitResult = await system.commitTransaction(prepareResult.transactionId);
        
        if (commitResult.success) {
            console.log('✅ Phase 2 succeeded - Transaction complete!');
        } else {
            console.log('❌ Phase 2 failed:', commitResult.error);
        }
        
        res.json({
            success: commitResult.success,
            phase1: prepareResult,
            phase2: commitResult,
            message: commitResult.success ? 'Order completed successfully!' : 'Order failed in Phase 2 (COMMIT)'
        });

    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reset database to initial state
app.post('/api/reset', async (req, res) => {
    try {
        await system.initializeSampleData();
        console.log('🔄 Database reset to initial state');
        res.json({ message: 'Database reset to initial state' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
async function startServer() {
    try {
        await system.connect();
        app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            console.log('📱 Open your browser and go to http://localhost:3000');
            console.log('\n🎯 This version works with standalone MongoDB!');
            console.log('💡 No replica set required - perfect for learning!');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
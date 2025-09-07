# 2-Phase Commit (2PC) E-commerce System

A simplified **E-commerce application** demonstrating the **Two-Phase Commit (2PC) protocol** using Node.js, Express, and MongoDB. This project simulates a distributed transaction where multiple participants (users, products, orders) must either **all commit** or **all abort**, ensuring **atomicity** and **consistency**.

---

## Table of Contents

* [Project Overview](#project-overview)
* [Prerequisites](#prerequisites)
* [Setup & Installation](#setup--installation)
* [Project Structure](#project-structure)
* [Database Design](#database-design)
* [2-Phase Commit Flow](#2-phase-commit-flow)
* [API Endpoints](#api-endpoints)
* [Frontend](#frontend)
* [Key Learning Outcomes](#key-learning-outcomes)
* [Future Improvements](#future-improvements)

---

## Project Overview

This project demonstrates how the **Two-Phase Commit (2PC)** works in real-world scenarios:

* **Phase 1 (PREPARE):** Check if all operations (balance deduction, stock reduction, order creation) can be safely performed.
* **Phase 2 (COMMIT):** Execute all operations if all checks passed; otherwise, abort the transaction.

It uses MongoDB to store users, products, orders, and transaction logs, and Express to provide API endpoints.

---

## Prerequisites

* Node.js (v16 or higher)
* MongoDB (Standalone instance running at `mongodb://localhost:27017`)
* Basic knowledge of REST APIs

---

## Setup & Installation

```bash
# Clone the repository
git clone <repo-url>
cd ecommerce-2pc

# Install dependencies
npm install

# Start the server
node server.js
```

**Access:**

* Backend API: `http://localhost:3000/api/...`
* Frontend UI: `http://localhost:3000/`

---

## Project Structure

```
ecommerce-2pc/
│
├── package.json              # Project dependencies & scripts
├── package-lock.json         # Dependency lock file
├── server.js                 # Main backend server (2PC implementation)
│
├── public/                   # Frontend (static files served by Express)
│   └── index.html            # UI for testing transactions
│
└── README.md                 # Project documentation
```

---

## Database Design

Collections used:

1. **users**

```json
{ "_id": "user1", "name": "John Doe", "balance": 1000 }
```

2. **products**

```json
{ "_id": "prod1", "name": "Laptop", "price": 800, "stock": 5 }
```

3. **orders**

```json
{ "_id": "order_12345", "userId": "user1", "productId": "prod1", "quantity": 1, "totalCost": 800, "status": "COMPLETED" }
```

4. **transactions**

```json
{ "_id": "txn_12345", "userId": "user1", "productId": "prod1", "quantity": 1, "totalCost": 800, "status": "PREPARED" }
```

---

## 2-Phase Commit Flow

### Phase 1: PREPARE

1. Validate that **user exists**.
2. Validate that **product exists**.
3. Check that **user has enough balance**.
4. Check that **product has enough stock**.
5. Create a **pending transaction** record in `transactions` collection.

✅ This phase **does not modify data**, just ensures the transaction can succeed.

### Phase 2: COMMIT

1. Deduct **user balance**.
2. Reduce **product stock**.
3. Create an **order record** in `orders` collection.
4. Update the transaction status to **COMMITTED**.

❌ If any step fails → transaction is **ABORTED** and changes are rolled back.

---

## API Endpoints

* `GET /api/state` → Returns current state of users, products, orders, and transactions.

* `POST /api/process-order` → Processes a new order using 2PC.
  **Request Body:**

```json
{ "userId": "user1", "productId": "prod1", "quantity": 1 }
```

* `POST /api/reset` → Resets the database to initial sample data.

---

## Frontend

* Simple UI served from `public/index.html`.
* Features:

  * Select user & product
  * Enter quantity
  * Place order button → triggers 2PC
  * Reset database button
* Displays step-by-step logs for Phase 1 and Phase 2 (✅ / ❌).

---

## Key Learning Outcomes

* Understand **Two-Phase Commit (2PC)** protocol.
* Learn difference between **prepare (validation)** and **commit (execution)**.
* See how distributed transactions ensure **atomicity & consistency**.
* Learn importance of **transaction snapshots** and **rollback mechanisms**.

---

## Future Improvements

* Use **MongoDB replica set** to simulate true distributed 2PC.
* Implement **automatic timeout recovery** for expired transactions.
* Enhance frontend with **transaction visualization**.
* Add **unit tests** for different transaction scenarios (success/failure).

---

## License

Free to use for **learning and teaching purposes**.

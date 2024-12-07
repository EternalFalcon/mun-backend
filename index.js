import express from "express";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  setDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import bodyParser from "body-parser";
import cors from "cors";
import crypto from "crypto";
import Razorpay from "razorpay";
import dotenv from "dotenv";

import shortid from "shortid";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ extended: false }));
app.use(bodyParser.json());

// Firebase Initialization
const firebaseConfig = {
  apiKey: "AIzaSyDLIsh-5C2GnoUiemDWevVwojcxSeoBIlo",
  authDomain: "sjbhsphenomenon2024.firebaseapp.com",
  projectId: "sjbhsphenomenon2024",
  storageBucket: "sjbhsphenomenon2024.firebaseapp.com",
  messagingSenderId: "321451426175",
  appId: "1:321451426175:web:8562dfd8795aa59033da4a",
  measurementId: "G-6M50VRN3YX",
};
const fireApp = initializeApp(firebaseConfig);
const db = getFirestore(fireApp);

// Razorpay Initialization
const razorpay = new Razorpay({
  key_id: "rzp_live_FYKXMux8xXT6nA",
  key_secret: "TXTocXXpZlYo4TOyAOzSijZY",
});

// Middleware to Ignore Favicon Requests
app.use((req, res, next) => {
  if (req.originalUrl.includes("favicon.ico")) {
    res.status(204).end();
  } else {
    next();
  }
});

// Test Route
app.get("/", (req, res) => {
  res.status(200).send("Backend is running!");
});

// Razorpay Payment Endpoint
app.post("/indipay", async (req, res) => {
  const { total } = req.body;
  const basePrice = 1;

  // Calculate total amount
  const totalAmount = basePrice * total;

  const options = {
    amount: totalAmount * 100, // Amount in paise
    currency: "INR",
    receipt: shortid.generate(),
    payment_capture: 1,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.status(200).json({
      id: order.id,
      currency: order.currency,
      amount: order.amount,
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ error: "Error creating order" });
  }
});

// Individual Registration Endpoint
app.post("/individual", async function (req, res) {
  try {
    // Log the incoming data
    console.log("Received data:", req.body);

    // Extract fields from the posted data
    const {
      fName,
      email,
      phoneNumber,
      dateOfBirth,
      isChecked,
      day1,
      day2,
      total,
    } = req.body;

    // Validate required fields

    // Parse day1 data
    const day1Data = {
      event: day1?.event || null,
      category: day1?.category || null,
      members: day1?.members || 0,
      additionalParticipants: day1?.additionalParticipants || [],
    };

    // Parse day2 data (only if it has valid members)
    const day2Data =
      day2?.members > 0
        ? {
            event: day2?.event || null,
            category: day2?.category || null,
            members: day2?.members,
            additionalParticipants: day2?.additionalParticipants || [],
          }
        : null;

    // Payment verification logic
    const { order_id, payment_id, razorpay_signature } = req.body;
    if (!order_id || !payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment details" });
    }

    const generated_signature = crypto
      .createHmac("sha256", razorpay.key_secret)
      .update(`${order_id}|${payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.error("Payment verification failed:", { generated_signature, razorpay_signature });
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // Firestore operations
    const regPage = doc(db, "mun-details", "registrations");
    const regInfo = (await getDoc(regPage)).data() || { id: 0, total: 0 };

    const newId = parseInt(regInfo.id || 0) + 10;
    const updatedTotal = parseInt(regInfo.total || 0) + total;

    // Prepare the data to store in Firestore
    const registrationData = {
      name: fName,
      email,
      phoneNumber,
      dateOfBirth,
      isChecked,
      day1: day1Data,
      day2: day2Data,
      total,
    };

    // Save to Firestore
    await setDoc(doc(db, "individual-registrations", newId.toString()), registrationData);
    await setDoc(
      regPage,
      { id: newId, total: updatedTotal },
      { merge: true }
    );

    res.status(200).json({ result: "success", ids: [[fName, newId]] });
  } catch (error) {
    console.error("Error in /individual endpoint:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});


// Delegation Registration Endpoint
app.post("/delegation", async (req, res) => {
  const { order_id, payment_id, razorpay_signature, delegation, name, total } = req.body;

  if (!order_id || !payment_id || !razorpay_signature ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Payment Verification
  const generated_signature = crypto
    .createHmac("sha256", razorpay.key_secret)
    .update(`${order_id}|${payment_id}`)
    .digest("hex");

  if (generated_signature !== razorpay_signature) {
    return res.status(400).json({ success: false, message: "Payment verification failed" });
  }

  try {
    const regPage = doc(db, "mun-details", "registrations");
    const regInfo = (await getDoc(regPage)).data() || { delegation: 0, totalDel: 0, total: 0 };

    const newDelegationId = parseInt(regInfo.delegation || 0) + 10;
    const updatedTotalDel = parseInt(regInfo.totalDel || 0) + 1;
    const updatedTotal = parseInt(regInfo.total || 0) + total;

    // Save delegation information
    await setDoc(doc(db, name, "information"), { ...req.body });
    await setDoc(
      regPage,
      {
        delegation: newDelegationId,
        totalDel: updatedTotalDel,
        total: updatedTotal,
      },
      { merge: true }
    );

    // Assign unique IDs to delegation members
    const ids = [];
    let id = parseInt(regInfo.id || 0);
    for (const person of delegation) {
      id += 10;
      ids.push([person.name, id]);
      await setDoc(doc(db, name, id.toString()), person);
    }

    await setDoc(regPage, { id }, { merge: true });

    res.status(200).json({ result: "success", ids });
  } catch (error) {
    console.error("Error processing delegation:", error);
    res.status(500).json({ error: "Error processing delegation" });
  }
});

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

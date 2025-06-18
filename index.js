import express from "express";
import { initializeApp } from "firebase/app";
import {
  collection,
  getDocs,
  getFirestore,
  setDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import bodyParser from "body-parser";
import cors from "cors";
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
  apiKey: "AIzaSyCiGpSWIznhjuH2aJ7f90lrGbtCojveNKA",
  authDomain: "bills-app-2a7e8.firebaseapp.com",
  projectId: "bills-app-2a7e8",
  storageBucket: "bills-app-2a7e8.firebasestorage.app",
  messagingSenderId: "315528552147",
  appId: "1:315528552147:web:341cba3c00888ae7b0be26",
  measurementId: "G-3BQESYYFKK"
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

// Helper functions
function updateStratagem(eventCounts, category) {
  const key = `stratagem-${category}`;
  eventCounts[key] = (eventCounts[key] || 0) + 1;
}

function updateGeneric(eventCounts, name) {
  eventCounts[name] = (eventCounts[name] || 0) + 1;
}

function processEvent(eventCounts, name, category) {
  if (!name) return;

  if (name === "stratagem") {
    updateStratagem(eventCounts, category);
  } else {
    updateGeneric(eventCounts, name);
  }
}

// Route handler
app.get("/fetchdata", async (req, res) => {
  try {
    const indiSnapshot = await getDocs(collection(db, "indiRegistrations"));
    const instiSnapshot = await getDocs(collection(db, "instiRegistrations"));
    const eventCounts = {};

    // Individual registrations
    indiSnapshot.forEach((doc) => {
      const data = doc.data();
      const event = data.event;
      if (event?.name) {
        processEvent(eventCounts, event.name, event.category);
      }
    });

    // Institutional registrations
    instiSnapshot.forEach((doc) => {
      const data = doc.data();
      const events = data.events;
      if (Array.isArray(events)) {
        events.forEach((event) => {
          if (event?.name) {
            processEvent(eventCounts, event.name, event.category);
          }
        });
      }
    });

    res.status(200).json(eventCounts);
  } catch (error) {
    console.error("Error fetching event data:", error);
    res.status(500).json({ error: "Failed to fetch event data: "+error });
  }
});

// Razorpay Payment Endpoint
app.post("/payment", async (req, res) => {
  const { type, members } = req.body;
  let total = 0;

  const amount = {
    '1' : 250,
    '2' : 400,
    '3' : 600,
    '5' : 1000,
  }

  if(type == 'insti'){
    total = 5900;
  }else if(type == 'indi'){
    for (let key in amount) {
      if (key == members) {
        total = amount[key];
      }
    }
  }else{
    res.status(500).json({
      error: "Error creating order"
    })
    return
  }

  const options = {
    amount: total * 100, // Amount in paise
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
app.post("/individual", async (req, res) => {
  try {
    console.log("Request payload at /individual:", req.body);

    // Use `name` from the request if `fName` is missing
    const {
      order_id,
      payment_id,
      razorpay_signature,
      name,
      email,
      phoneNumber,
      dateOfBirth,
      event,
      total,
    } = req.body;

    // Assign `name` to `fName` if `fName` is not explicitly provided
    const finalName = name || "Anonymous";

    if (!order_id || !payment_id || !razorpay_signature || !total) {
      return res.status(400).json({ error: "Missing required fields", data: req.body });
    }

    const registrationData = {
      fName: finalName,
      email: email || "No email provided",
      phoneNumber: phoneNumber || "No phone number provided",
      dateOfBirth: dateOfBirth || "No date of birth provided",
      event: event || {},
    };

    console.log("Registration Data before Firestore:", registrationData);

    const regPage = doc(db, "details", "registrations");
    const regInfo = (await getDoc(regPage)).data() || { id: 0, total: 0 };

    const newId = parseInt(regInfo.id || 0) + 10;
    const updatedTotal = parseInt(regInfo.total || 0) + total;

    console.log("New ID:", newId, "Updated Total:", updatedTotal);

    await setDoc(doc(db, "indiRegistrations", newId.toString()), registrationData);
    await setDoc(
      regPage,
      { id: newId, total: updatedTotal },
      { merge: true }
    );

    res.status(200).json({ result: "success", ids: [[finalName, newId]] });
  } catch (error) {
    console.error("Error in /individual endpoint:", error.message);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});


// Delegation Registration Endpoint
app.post("/delegation", async (req, res) => {
  try {
    console.log("Request payload at /delegation:", req.body);

    const {
      order_id,
      payment_id,
      razorpay_signature,
      institutionName,
      totalParticipants,
      teacher,
      events,
    } = req.body;

    // Validation for required fields
    if (!order_id || !payment_id || !razorpay_signature || !institutionName || !events || !teacher) {
      return res.status(400).json({
        error: "Missing required fields",
        data: req.body,
      });
    }
  
    // Prepare registration data
    const regPage = doc(db, "details", "registrations");
    const regInfo = (await getDoc(regPage)).data() || { id: 0, institution: 0, total: 0 };

    const newInstitutionId = parseInt(regInfo.id || 0) + 12;
    const updatedTotal = parseInt(regInfo.total || 0) + totalParticipants;
    const updatedInsti = parseInt(regInfo.institution || 0) + 1;

    console.log("New Delegation ID:", newInstitutionId, "Updated Total:", updatedTotal);

    // Save delegation information
    const delegationData = {
      institutionName,
      totalParticipants,
      teacher,
      events,
      paymentDetails: {
        order_id,
        payment_id,
        razorpay_signature,
      },
      timestamp: new Date().toISOString(),
    };

    // Save delegation data under the institution
    console.log("Saving delegation data...");
    await setDoc(doc(db, "instiRegistrations", newInstitutionId.toString()), delegationData);

    // Update delegation summary in Firestore
    console.log("Updating delegation summary...");
    await setDoc(
      regPage,
      { id: newInstitutionId, institution: updatedInsti,  total: updatedTotal },
      { merge: true }
    );

    res.status(200).json({ result: "success", ids: [[institutionName, newInstitutionId]] });
  } catch (error) {
    console.error("Error in /delegation endpoint:", error.message);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

app.post("/message", async (req, res) => {
  try{
    console.log("Request payload at /message:", req.body);

    const {
      name,
      email,
      phone,
      message,
    } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Missing required fields",
        data: req.body,
      });
    }

    if (!validateEmail(email)) { // Check if email is missing OR if it doesn't pass regex
      return res.status(400).json({
        error: "Invalid or missing email address", // More specific error message
        data: req.body,
      });
    }

    const timestamp = new Date().toISOString();

    const messagePage = doc(db, "messages", timestamp);
    const data = {
      name, 
      email,
      phone,
      message,
      timestamp
    }

    console.log("Updating delegation summary...");
    await setDoc(
      messagePage,
      data
    );

    res.status(200).json({ result: "success" });
  }catch (error) {
    console.error("Error in /message endpoint:", error.message);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
})



// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

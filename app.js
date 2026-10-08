const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const http = require("http"); // Native Node HTTP module to combine Express & WebSockets
const { WebSocketServer } = require("ws"); // WebSocket module for real-time synchronization
const session = require("express-session"); // Session module for tracking individual state maps

const app = express();
const PORT = 8080; // Your running configuration port

// Create an HTTP server instance wrapping the Express engine configuration
const server = http.createServer(app);

// Bind the WebSocket Server directly onto the HTTP server engine instance
const wss = new WebSocketServer({ server });

// Setup View Engine to parse Embedded JavaScript (EJS)
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/testimg", express.static(path.join(__dirname, "testimg")));
// Middleware Pipeline Configuration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Initialize Session Middleware Memory Storage Map
app.use(
  session({
    secret: "pos_hub_secure_secret_crypto_key_2026", // Change this to a secure environment variable in production
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to true if running over HTTPS
      maxAge: 1000 * 60 * 60 * 8, // Sessions persist uniquely for 8 Hours
    },
  }),
);

// Global view context interceptor: Passes active user session properties to every rendered view layout automatically
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Ensure storage directories exist programmatically
if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
if (!fs.existsSync("./data")) fs.mkdirSync("./data");

// Storage Configuration for Adding Custom Products via Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage: storage });

const productsPath = path.join(__dirname, "data", "products.json");
const salesPath = path.join(__dirname, "data", "sales.json");
const usersPath = path.join(__dirname, "data", "users.json");

// Helper utility to safely extract structured JSON local databases
const readJSONFile = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content || "[]");
  } catch (e) {
    return [];
  }
};

// ==========================================
// CUSTOM INTERCEPTOR MIDDLEWARES
// ==========================================

// Authentication Guard Middleware: Rejects unauthenticated traffic
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next(); // Session valid. Proceed down the routing pipe
  }
  // Intercept operation: send user out to login portal
  res.redirect("/login");
};

// Administrative Rights Enforcement Middleware: Rejects non-admin operators
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.user) {
    const role = req.session.user.role;
    const username = req.session.user.username.toLowerCase();

    if (role === "admin" || username === "admin") {
      return next(); // Verified admin profile credential tracker. Proceed forward.
    }
  }
  // Unauthorized entry fallback scenario
  res
    .status(403)
    .send(
      "Access Denied: Administrative permissions are required to view this dashboard ledger.",
    );
};

// WEBSOCKET BROADCAST METHOD: Loops through every active open tab connection
const broadcastRefresh = () => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // 1 means connection state is OPEN
      client.send(JSON.stringify({ type: "REFRESH_DATA" }));
    }
  });
};

// ==========================================
// AUTHENTICATION & REGISTRATION ROUTES
// ==========================================

// GET: Render Registration Panel
app.get("/register", (req, res) => {
  res.render("register", { error: null, success: null });
});

// POST: Process New Operator Registrations
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render("register", {
      error: "All profile input parameters are required.",
      success: null,
    });
  }

  const users = readJSONFile(usersPath);

  // Validate if username profile identifier is unique
  const userExists = users.some(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (userExists) {
    return res.render("register", {
      error: "Username is already registered on this machine.",
      success: null,
    });
  }

  // AUTOMATIC PROMOTION: Force role: "admin" permanently if the username typed is "admin"
  const assignedRole =
    username.trim().toLowerCase() === "admin" ? "admin" : "authorized_cashier";

  const newUser = {
    id: "USR-" + Date.now(),
    username: username.trim(),
    password: password, // Plaintext reference mapping matching your existing configuration model
    role: assignedRole, // Saved permanently in users.json
  };

  users.push(newUser);
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

  return res.render("register", {
    error: null,
    success: "Account registered successfully! You can now log in.",
  });
});

// GET: Render Login Panel
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// POST: Verify Registered Users and Maintain Active Sessions
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = readJSONFile(usersPath);

  // Cross-reference data collections against incoming form data
  const matchingUser = users.find(
    (u) =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password,
  );

  if (matchingUser) {
    // FALLBACK PROTECTION: Check database property first, otherwise fallback dynamically if username is "admin"
    let assignedRole = "authorized_cashier";
    if (matchingUser.role) {
      assignedRole = matchingUser.role;
    } else if (matchingUser.username.toLowerCase() === "admin") {
      assignedRole = "admin";
    }

    // Write valid session credentials to the client browser cookie cache
    req.session.user = {
      id: matchingUser.id,
      username: matchingUser.username,
      role: assignedRole,
      loginTime: new Date(),
    };

    // Instantiate an independent session cart if empty
    if (!req.session.cart) {
      req.session.cart = [];
    }

    return res.redirect("/terminal");
  } else {
    return res.render("login", {
      error: "Invalid Operator Username or Secure Access Pin.",
    });
  }
});

// GET: Log Out / Erase Active Tracking Cookie
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Error destroying terminal session map:", err);
    res.redirect("/login");
  });
});

// ==========================================
// 1. RENDER HOME PAGE STOREFRONT & OFFERS
// ==========================================
app.get("/", (req, res) => {
  const products = readJSONFile(productsPath);

  const specialOffers = [
    {
      title: "Summer Tech Bundle",
      description: "Get 15% off when buying a keyboard and mouse together.",
      badge: "Hot Deal",
    },
    {
      title: "Monitor Upgrade Promo",
      description:
        "Free shipping and a premium HDMI cable with every UltraWide monitor.",
      badge: "Limited Time",
    },
  ];

  res.render("home", {
    products: products,
    offers: specialOffers,
  });
});

// ==========================================
// 2. RENDER POS SALES TERMINAL DASHBOARD (Cashier / Customer View)
// ==========================================
app.get("/terminal", requireAuth, (req, res) => {
  const products = readJSONFile(productsPath);

  // Safely fallback to an empty array if this unique browser session has no items yet
  const userCart = req.session.cart || [];
  const cartTotal = userCart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  res.render("dashboard", {
    products: products,
    cart: userCart,
    cartTotal: cartTotal.toFixed(2),
  });
});

// ==========================================
// 3. RENDER ADMINISTRATIVE INVENTORY DESK (ADMIN ONLY)
// ==========================================
app.get("/admin/inventory", requireAdmin, (req, res) => {
  const products = readJSONFile(productsPath);
  const sales = readJSONFile(salesPath); // Read sales logs database

  res.render("admin-inventory", {
    products: products,
    sales: sales, // Expose sales variable to EJS template
  });
});

// ==========================================
// 4. ADD PRODUCT TO CART (AUTHENTICATED REQ ENFORCED)
// ==========================================
app.post("/cart/add", requireAuth, (req, res) => {
  const { productId } = req.body;
  const products = readJSONFile(productsPath);
  const targetProduct = products.find((p) => p.id === productId);

  // Initialize session array mapping explicitly if it does not yet exist
  if (!req.session.cart) {
    req.session.cart = [];
  }

  if (targetProduct) {
    const existingCartItem = req.session.cart.find(
      (item) => item.id === productId,
    );
    if (existingCartItem) {
      existingCartItem.quantity += 1;
    } else {
      req.session.cart.push({ ...targetProduct, quantity: 1 });
    }
  }

  broadcastRefresh();
  res.redirect("/terminal");
});

// ==========================================
// 5. DECREMENT ITEM FROM CART
// ==========================================
app.post("/cart/remove", requireAuth, (req, res) => {
  const { productId } = req.body;
  if (!req.session.cart) req.session.cart = [];

  const itemIndex = req.session.cart.findIndex((item) => item.id === productId);

  if (itemIndex !== -1) {
    if (req.session.cart[itemIndex].quantity > 1) {
      req.session.cart[itemIndex].quantity -= 1;
    } else {
      req.session.cart.splice(itemIndex, 1);
    }
  }

  broadcastRefresh();
  res.redirect("/terminal");
});

// ==========================================
// 6. FORCE CART REMOVE OPTION (Erase Entire Item Row)
// ==========================================
app.post("/cart/remove-all", requireAuth, (req, res) => {
  const { productId } = req.body;
  if (!req.session.cart) req.session.cart = [];

  req.session.cart = req.session.cart.filter((item) => item.id !== productId);

  broadcastRefresh();
  res.redirect("/terminal");
});

// ==========================================
// 7. CHECKOUT & SAVE TO SALES RECORD
// ==========================================
app.post("/cart/checkout", requireAuth, (req, res) => {
  const userCart = req.session.cart || [];

  // If cart is empty, respond based on how it was requested
  if (userCart.length === 0) {
    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }
    return res.redirect("/terminal");
  }

  // 1. Capture the customer specs sent from the modal form
  const customerName = req.body.customerName || "Valued Customer";
  const customerAddress = req.body.customerAddress || "Walk-in Counter Sale";

  const salesLog = readJSONFile(salesPath);

  // 2. Map items while associating them with the customer info
  userCart.forEach((item) => {
    const newSale = {
      saleId: "SALE-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      customerName: customerName, // Saved to ledger record
      customerAddress: customerAddress, // Saved to ledger record
      productName: item.name,
      price: parseFloat(item.price),
      quantity: parseInt(item.quantity),
      totalAmount: parseFloat((item.price * item.quantity).toFixed(2)),
      imagePath: item.imagePath,
      saleDate: new Date().toISOString(),
    };
    salesLog.push(newSale);
  });

  fs.writeFileSync(salesPath, JSON.stringify(salesLog, null, 2));

  // Wipe the specific user session-based order cart map completely
  req.session.cart = [];

  // If you have a total tracker stored in session, clear it too
  if (req.session.cartTotal) req.session.cartTotal = "0.00";

  // Trigger your WebSocket broadcast
  if (typeof broadcastRefresh === "function") {
    broadcastRefresh();
  }

  // 3. Handle both AJAX/Fetch requests and standard Form submissions
  if (
    req.xhr ||
    req.headers.accept.indexOf("json") > -1 ||
    (req.headers["content-type"] &&
      req.headers["content-type"].includes("application/x-www-form-urlencoded"))
  ) {
    // If called via the frontend Fetch API, return a 200 OK JSON status
    return res
      .status(200)
      .json({ success: true, message: "Transaction completed successfully" });
  }

  // Fallback if standard html submission is executed elsewhere
  res.redirect("/checkout-success");
});

// ==========================================
// 8. ADMINISTRATIVE PRODUCT INTAKE CREATION (ADMIN ONLY)
// ==========================================
app.post(
  "/product/create",
  requireAdmin,
  upload.single("newProductImage"),
  (req, res) => {
    const { newProductName, newProductPrice } = req.body;
    const products = readJSONFile(productsPath);

    if (!req.file)
      return res
        .status(400)
        .send("Product layouts require an illustration attachment file.");

    const newEntry = {
      id: "PROD-" + Date.now(),
      name: newProductName,
      price: parseFloat(newProductPrice),
      imagePath: `/uploads/${req.file.filename}`,
    };

    products.push(newEntry);
    fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));

    broadcastRefresh();
    res.redirect("/admin/inventory"); // Returns to management desk
  },
);

// ==========================================
// 9. ADMINISTRATIVE PRODUCT UPDATE (ADMIN ONLY)
// ==========================================
app.post(
  "/product/update",
  requireAdmin,
  upload.single("updateProductImage"),
  (req, res) => {
    const { productId, updateProductName, updateProductPrice } = req.body;
    let products = readJSONFile(productsPath);

    const targetIndex = products.findIndex((p) => p.id === productId);
    if (targetIndex !== -1) {
      products[targetIndex].name = updateProductName;
      products[targetIndex].price = parseFloat(updateProductPrice);

      if (req.file) {
        products[targetIndex].imagePath = `/uploads/${req.file.filename}`;
      }

      fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));

      // Synchronize active user sessions if a cart array initialized exists
      if (req.session && req.session.cart) {
        req.session.cart = req.session.cart.map((item) => {
          if (item.id === productId) {
            return {
              ...item,
              name: updateProductName,
              price: parseFloat(updateProductPrice),
              imagePath: req.file
                ? `/uploads/${req.file.filename}`
                : item.imagePath,
            };
          }
          return item;
        });
      }

      broadcastRefresh();
    }
    res.redirect("/admin/inventory");
  },
);

// ==========================================
// 10. ADMINISTRATIVE PRODUCT DELETE (ADMIN ONLY) - WITH ALERT REDIRECT
// ==========================================
app.post("/product/delete", requireAdmin, (req, res) => {
  const { productId } = req.body;

  let products = readJSONFile(productsPath);
  const salesLog = readJSONFile(salesPath);

  // 1. Locate the item to find its literal name before filtering it out
  const targetProduct = products.find((p) => p.id === productId);

  if (!targetProduct) {
    return res.send(`
      <script>
        alert("Error: Product record could not be located.");
        window.location.href = "/admin/inventory";
      </script>
    `);
  }

  // 2. Scan sales history using the product name
  const hasBeenSold = salesLog.some(
    (sale) =>
      sale.productName.toLowerCase() === targetProduct.name.toLowerCase(),
  );

  // 3. Boundary Guard: Alert and redirect back if transaction history exists
  if (hasBeenSold) {
    // Escaping single quotes in the product name just in case it contains apostrophes
    const safeProductName = targetProduct.name.replace(/'/g, "\\'");

    return res.send(`
      <script>
        alert("Access Denied:\\n\\nThe item '${safeProductName}' cannot be deleted because it is linked to active sales transaction logs.");
        window.location.href = "/admin/inventory";
      </script>
    `);
  }

  // 4. Safe to proceed if no sales matches were detected
  products = products.filter((p) => p.id !== productId);
  fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));

  // Drop item from active terminal session immediately
  if (req.session && req.session.cart) {
    req.session.cart = req.session.cart.filter((item) => item.id !== productId);
  }

  broadcastRefresh();
  res.redirect("/admin/inventory");
});

// ==========================================
// 11. VIEW ARCHIVED RECEIPTS PAGE (ADMIN ONLY)
// ==========================================
app.get("/sales", requireAdmin, (req, res) => {
  const sales = readJSONFile(salesPath);
  res.render("sales-log", { sales: sales.reverse() });
});

// ==========================================
// REAL-TIME WEBSOCKET CHAT & REFRESH ENGINE
// ==========================================
wss.on("connection", (socket) => {
  console.log("A POS Hub Terminal client connected via WebSocket.");

  socket.on("message", (rawData) => {
    try {
      const data = JSON.parse(rawData);

      // If the incoming message is a chat dispatch, broadcast it to all other open tabs
      if (data.type === "CHAT_MSG") {
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            // 1 = OPEN
            client.send(
              JSON.stringify({
                type: "CHAT_MSG",
                sender: data.sender,
                message: data.message,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              }),
            );
          }
        });
      }
    } catch (err) {
      console.error(
        "Error processing WebSocket message pipeline payload:",
        err,
      );
    }
  });
});

// ==========================================
// ROUTE MATCH: TARGET TO CHOSEN VIEW FILE NATIVE NAME
// ==========================================
app.get("/checkout-success", requireAuth, (req, res) => {
  res.render("checkout-success");
});

// Boot listening operation to server instance
server.listen(PORT, () =>
  console.log("POS Hub Engine online at http://localhost:" + PORT),
);

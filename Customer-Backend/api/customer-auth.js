if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

// App dependencies
const express = require("express");
const router = express.Router();
const schema = require("../../config/schemas");
const bcrypt = require("bcrypt");
const passport = require("passport");
const jwt = require("jwt-simple");
const Joi = require("joi");

// Salt required for hasing customer's password
const saltRounds = 10;

// Load the passport.js config from the setup
const initializePassport = require("../passport/local-config");

// Initialise a session with the User's email and ID
initializePassport(
  passport,
  async (email) => await schema.Customer.findOne({ email }).exec(),
  async (id) => await schema.Customer.findById(id).exec()
);

// Function which restricts unauthenticated users
function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/api/customer/login");
}

// Function which restricts authenticated users from accessing login and rego page
function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/api/customer/home");
  }
  next();
}

// GET request for home page
router.get("/home", checkAuthenticated, (req, res) => {
  res.render("customer-home.ejs", {
    name: req.user.name.given + " " + req.user.name.family,
  });
});

// GET request for login page
router.get("/login", checkNotAuthenticated, (req, res) => {
  res.render("customer-login.ejs");
});

// POST request for login
router.post(
  "/login",
  passport.authenticate("local", { failureFlash: true }),
  (req, res) => {
    // Generate JWT Token using unique email, password, and timestamp and store it
    const jwtToken = jwt.encode(
      {
        email: req.body.email,
        password: req.body.password,
      },
      process.env.JWT_SECRET
    );
    let query = schema.Customer.findOneAndUpdate(
      { email: req.body.email },
      { token: jwtToken }
    );
    query.exec((err) => {
      if (err) {
        console.log(err.message);
        res.status(500).send(err.message);
      } else {
        res.send({ token: jwtToken });
      }
    });
  }
);

// GET request for register page
router.get("/register", checkNotAuthenticated, (req, res) => {
  res.render("customer-register.ejs");
});

// POST request for register
router.post("/register", checkNotAuthenticated, (req, res) => {
  var query = schema.Customer.find({ email: req.body.email });
  query.exec((err, customers) => {
    // Ensure user does not exist yet
    if (err || customers.length) {
      res.status(500).send("Account with that email already exists.");
      res.redirect("/api/customer/register");
    } else {
      // Check if password abides strict password policy or not
      const { error } = validatePassword(req.body);
      // Signal password error if occurs
      if (error) {
        console.log("Password policy breached");
        res.status(500).send("The password must be at least 8 characters, at least 1 letter and a number");
        return;
      }
      // Generate a password hash based on user's inserted password
      bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
        if (err) {
          console.log(err);
          res.redirect("/api/customer/register");
        } else {
          // Put the user and password in our database
          schema.Customer.insertMany([
            {
              email: req.body.email,
              name: {
                given: req.body.givenname,
                family: req.body.familyname,
              },
              password: hash,
            },
          ])
            .then(() => {
              // Redirect user back to login if successful
              res.redirect("/api/customer/login");
            })
            .catch((err) => {
              console.log(err.message);
              res.status(500).send(err.message);
              res.redirect("/api/customer/register");
            });
        }
      });
    }
  });
});

// Route for updating the customer info
router.post(
  "/update",
  passport.authenticate("bearer", { failureFlash: true }),
  async (req, res) => {
    // Do security check
    // We have an authenticated user
    if (!(await bcrypt.compare(req.body.old_password, req.user.password))) {
      // Return unauthorized
      res.status(401).send("Unauthorized to such actions");
    }

    // Update the Email if it's not null
    if (req.body.new_email != null) {
      // Update the username
      let query = schema.Customer.findOneAndUpdate(
        { email: req.user.email },
        { email: req.body.new_email }
      );
      query.exec((err) => {
        if (err) {
          console.log(err.message);
          res.status(500).send(err.message);
        } else {
          console.log("Email updated.");
        }
      });
    }

    if (req.body.new_password != null) {
      // Generate the hash of the new password
      bcrypt.hash(req.body.new_password, saltRounds, function (err, hash) {
        if (err) {
          console.log(err);
          res.redirect();
        } else {
          // Create a new token
          const jwtToken = jwt.encode(
            {
              email: req.body.email,
              password: req.body.password,
            },
            process.env.JWT_SECRET
          );

          // Update the password hash and token of the user
          let query = schema.Customer.findOneAndUpdate(
            { email: req.user.email },
            { token: jwtToken, password: hash }
          );

          query.exec((err) => {
            if (err) {
              console.log(err.message);
              res.status(500).send(err.message);
            } else {
              console.log.send("Password updated");
            }
          });
        }
      });
    }
    res.send(req.user);
  }
);

// Route for logging out
router.delete("/logout", (req, res) => {
  // Using passport to logout
  req.logOut();
  res.redirect("/api/customer/login");
});

/*------------------------------------- HELPER FUNCTIONS ----------------------------------------*/
/**
 * Function to enforce password policy of min 8 characters, at least one alphabet and number
 *
 * @param signup: The request body of POST request to the route
 * @returns The error if there are any issues
 */
function validatePassword(signup) {
  const schema = Joi.object({
    password: Joi.string()
      // Regex to check at least 1 alphabet
      .pattern(new RegExp("[a-zA-Z]+"))
      // Regex to check at least one number between 0-9
      .pattern(new RegExp("[0-9]+"))
      .min(8)
      .required(),
  }).unknown();

  return schema.validate(signup);
}

// Returning the router back
module.exports = router;

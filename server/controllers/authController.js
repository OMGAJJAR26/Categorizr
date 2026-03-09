// import db from "../config/db.js";
// import jwt from "jsonwebtoken";
// import dotenv from "dotenv";
// import nodemailer from "nodemailer";
// import bcrypt from "bcrypt";
// dotenv.config();

// const generateToken = (user) => {
//   return jwt.sign(
//     { id: user.id, username: user.username },
//     process.env.JWT_SECRET,
//     {
//       expiresIn: "1d",
//     }
//   );
// };

// // ✅ Signup with bcrypt
// export const signup = async (req, res) => {
//   const { username, email_address, password } = req.body;

//   if (!username || !email_address || !password) {
//     return res.status(400).json({ message: "All fields are required" });
//   }

//   const checkSql = `SELECT * FROM tbl_user WHERE username = ? OR email_address = ?`;
//   db.query(
//     checkSql,
//     [username, email_address],
//     async (checkErr, checkResult) => {
//       if (checkErr) {
//         return res
//           .status(500)
//           .json({ message: "Check error", error: checkErr });
//       }
//       if (checkResult.length > 0) {
//         return res
//           .status(400)
//           .json({ message: "Username or Email already exists" });
//       }

//       const hashedPassword = await bcrypt.hash(password, 10);

//       const sql = `
//       INSERT INTO tbl_user 
//       (username, email_address, password, create_date, last_modified_date) 
//       VALUES (?, ?, ?, UNIX_TIMESTAMP(), UNIX_TIMESTAMP())
//     `;

//       db.query(
//         sql,
//         [username, email_address, hashedPassword],
//         (err, result) => {
//           if (err) {
//             return res
//               .status(500)
//               .json({ message: "Database error", error: err });
//           }
//           return res.status(200).json({
//             message: "Signup successful",
//             userId: result.insertId,
//           });
//         }
//       );
//     }
//   );
// };

// // ✅ Login with bcrypt
// // export const login = (req, res) => {
// //   const { username, password } = req.body;

// //   if (!username || !password) {
// //     return res.status(400).json({ message: "Username and password required" });
// //   }

// //   const sql = "SELECT * FROM tbl_user WHERE username = ?";
// //   db.query(sql, [username], async (err, results) => {
// //     if (err)
// //       return res.status(500).json({ message: "Database error", error: err });

// //     if (results.length === 0) {
// //       return res.status(401).json({ message: "Invalid username or password" });
// //     }

// //     const user = results[0];
// //     const isMatch = await bcrypt.compare(password, user.password);

// //     if (!isMatch) {
// //       return res.status(401).json({ message: "Invalid username or password" });
// //     }

// //     return res.status(200).json({ message: "Login successful", user });
// //   });
// // };

// // ✅ Forgot Password
// export const forgotPassword = (req, res) => {
//   const { recoveryEmail } = req.query;

//   if (!recoveryEmail) {
//     return res.status(400).json({ message: "Recovery email is required" });
//   }

//   const checkUserSQL = "SELECT * FROM tbl_user WHERE recovery_email = ?";
//   db.query(checkUserSQL, [recoveryEmail], (err, results) => {
//     if (err) {
//       console.error(" DB error:", err);
//       return res.status(500).json({ message: "Database error", error: err });
//     }

//     if (results.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "No account found with this email" });
//     }

//     const user = results[0];
//     const resetLink = `http://localhost:5173/resetpassword/${user.id}`;

//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//       },
//     });

//     const mailOptions = {
//       from: `"Categorizr Support" <${process.env.EMAIL_USER}>`,
//       to: recoveryEmail,
//       subject: "Reset Your Password - Categorizr",
//       html: `
//         <div style="font-family: Arial, sans-serif; line-height: 1.5;">
//           <h2>Hello ${user.user_name || "User"},</h2>
//           <p>You requested to reset your password. Click the button below to proceed:</p>
//           <a href="${resetLink}" style="display:inline-block;background-color:#0070f3;color:#fff;padding:12px 20px;border-radius:5px;text-decoration:none;">
//             Reset Password
//           </a>
//           <p style="margin-top:16px;">If you didn't request this, you can safely ignore this email.</p>
//           <hr style="margin-top:32px;"/>
//           <p style="font-size:12px;color:gray;">Categorizr Support Team</p>
//         </div>
//       `,
//     };

//     transporter.sendMail(mailOptions, (mailErr, info) => {
//       if (mailErr) {
//         console.error("Email sending error:", mailErr);
//         return res
//           .status(500)
//           .json({ message: "Error sending email", error: mailErr });
//       }

//       return res.status(200).json({
//         message: "Recovery email sent successfully. Please check your inbox.",
//         resetLink,
//       });
//     });
//   });
// };

import express from "express";
import {
  quickbooksConnect,
  quickbooksCallback,
  quickbooksStatus,
  quickbooksDisconnect,
  quickbooksUploadReceipt,
  xeroConnect,
  xeroCallback,
  xeroUploadReceipt,
  xeroStatus,
  freshbooksClassicConnect,
  freshbooksClassicStatus,
  freshbooksClassicUploadReceipt,
  freshbooksClassicCallback,
  sageIntacctConnect,
  sageIntacctStatus,
  sageIntacctUpload,
  sageBusinessCloudUpload,
} from "../controllers/integrationsController.js";

const router = express.Router();

// QuickBooks
router.get("/quickbooks/connect", quickbooksConnect);
router.get("/quickbooks/callback", quickbooksCallback);
router.get("/quickbooks/status", quickbooksStatus);
router.delete("/quickbooks/disconnect", quickbooksDisconnect);
router.post("/quickbooks/receipts", quickbooksUploadReceipt);

// Xero
router.get("/xero/connect", xeroConnect);
router.get("/xero/callback", xeroCallback);
router.post("/xero/receipts", xeroUploadReceipt);
router.get("/xero/status", xeroStatus);

// FreshBooks Classic
router.get("/freshbooks-classic/connect", freshbooksClassicConnect);
router.get("/freshbooks-classic/status", freshbooksClassicStatus);
router.get("/freshbooks-classic/callback", freshbooksClassicCallback);
router.post("/freshbooks-classic/receipts", freshbooksClassicUploadReceipt);

// Sage Intacct (XML API)
router.get("/sage-intacct/connect", sageIntacctConnect);
router.get("/sage-intacct/status", sageIntacctStatus);
router.post("/sage-intacct/receipts", sageIntacctUpload);

// Sage Business Cloud
router.post("/sage-bc/receipts", sageBusinessCloudUpload);

export default router;

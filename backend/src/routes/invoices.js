const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole, ELEKTRONIK_ROLES } = require('../middleware/roleCheck');
const { handleValidation } = require('../middleware/validate');
const { createInvoiceRules, updateInvoiceRules, updateInvoiceItemsRules } = require('../middleware/validators');
const { getInvoices, getInvoiceById, createInvoice, updateInvoice, updateInvoiceItems, submitApproval, approveInvoice, rejectInvoice, printInvoice, deleteInvoice, cancelInvoice } = require('../controllers/invoiceController');

// Seluruh modul invoice hanya untuk role elektronik (ADMIN/SUPER_USER/USER).
// KATALOG_USER dikecualikan di sini (H-01).
router.use(auth, requireRole(...ELEKTRONIK_ROLES));

router.get('/', getInvoices);
router.get('/:id', getInvoiceById);
router.post('/', createInvoiceRules, handleValidation, createInvoice);
router.put('/:id', updateInvoiceRules, handleValidation, updateInvoice);
router.put('/:id/items', updateInvoiceItemsRules, handleValidation, updateInvoiceItems);
router.delete('/:id', deleteInvoice);
router.post('/:id/submit', submitApproval);
router.post('/:id/approve', requireRole('ADMIN'), approveInvoice);
router.post('/:id/reject', requireRole('ADMIN'), rejectInvoice);
router.post('/:id/cancel', requireRole('ADMIN'), cancelInvoice);
router.put('/:id/print', printInvoice);

module.exports = router;

import { google } from 'googleapis';
import { logger } from './logger.js';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(process.cwd(), 'credentials.json'),
  scopes: SCOPES,
});

// Helper function to validate spreadsheet ID format
function isValidSpreadsheetId(id) {
  return typeof id === 'string' && id.length > 0;
}

// Helper function to validate transaction data
function validateTransactionData(transaction) {
  const required = ['date', 'type', 'amount'];
  const missing = required.filter(field => !transaction[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  if (typeof transaction.amount !== 'number' || isNaN(transaction.amount)) {
    throw new Error('Amount must be a valid number');
  }

  if (!['income', 'expense'].includes(transaction.type)) {
    throw new Error('Type must be either income or expense');
  }
}

// Helper function to delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Format tanggal ke DD-MM-YYYY
function formatDateForSheet(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) return dateString;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

export async function appendTransactionToSheet(spreadsheetId, transaction) {
  // Validate spreadsheet ID
  if (!isValidSpreadsheetId(spreadsheetId)) {
    throw new Error('Invalid spreadsheet ID');
  }

  // Validate transaction data
  validateTransactionData(transaction);

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = await auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth: client });

      // Verify spreadsheet exists and is accessible
      try {
        await sheets.spreadsheets.get({ spreadsheetId });
      } catch (err) {
        throw new Error(`Spreadsheet not accessible: ${err.message}`);
      }

      const values = [[
        formatDateForSheet(transaction.date),           // TANGGAL
        transaction.type === 'income' ? 'PENDAPATAN' : 'KEBUTUHAN',  // TRANSAKSI
        transaction.category || 'Lainnya',                // KATEGORI
        transaction.description || '-',                   // DESKRIPSI
        transaction.amount || 0,                          // TOTAL
        transaction.notes || ''                           // NOTES (optional)
      ]];

      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'TRANSAKSI!B:G',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      logger.info({
        event: 'sheet_append_success',
        spreadsheetId,
        data: transaction,
        response: response.status,
        attempt
      });

      return response;
    } catch (err) {
      lastError = err;
      logger.warn({
        event: 'sheet_append_retry',
        spreadsheetId,
        attempt,
        error: err.message
      });

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY * attempt); // Exponential backoff
      }
    }
  }

  // If we get here, all retries failed
  logger.error({
    event: 'sheet_append_failed',
    spreadsheetId,
    data: transaction,
    error: lastError.message,
    attempts: MAX_RETRIES
  });
  
  throw new Error(`Failed to append to spreadsheet after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

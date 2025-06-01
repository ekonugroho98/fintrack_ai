import { appendTransactionToSheet } from '../worker/utils/sheets.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSheets() {
  try {
    console.log('🚀 Starting sheets test...');

    // Test case 1: Valid income transaction
    const incomeTransaction = {
      date: new Date().toISOString(),
      type: 'income',
      amount: 1000000,
      category: 'Gaji',
      description: 'Gaji Bulan Maret',
      notes: 'Bonus included'
    };

    console.log('\n📝 Test Case 1: Valid Income Transaction');
    console.log('Input:', JSON.stringify(incomeTransaction, null, 2));
    
    const result1 = await appendTransactionToSheet(process.env.TEST_SPREADSHEET_ID, incomeTransaction);
    console.log('✅ Success:', result1.status === 200 ? 'Yes' : 'No');
    console.log('Response:', JSON.stringify(result1.data, null, 2));

    // Test case 2: Valid expense transaction
    const expenseTransaction = {
      date: new Date().toISOString(),
      type: 'expense',
      amount: 50000,
      category: 'Makanan',
      description: 'Lunch di Warung',
      notes: ''
    };

    console.log('\n📝 Test Case 2: Valid Expense Transaction');
    console.log('Input:', JSON.stringify(expenseTransaction, null, 2));
    
    const result2 = await appendTransactionToSheet(process.env.TEST_SPREADSHEET_ID, expenseTransaction);
    console.log('✅ Success:', result2.status === 200 ? 'Yes' : 'No');
    console.log('Response:', JSON.stringify(result2.data, null, 2));

    // Test case 3: Invalid transaction (missing required fields)
    const invalidTransaction = {
      date: new Date().toISOString(),
      // missing type and amount
      category: 'Test'
    };

    console.log('\n📝 Test Case 3: Invalid Transaction (Missing Fields)');
    console.log('Input:', JSON.stringify(invalidTransaction, null, 2));
    
    try {
      await appendTransactionToSheet(process.env.TEST_SPREADSHEET_ID, invalidTransaction);
      console.log('❌ Test failed: Should have thrown an error');
    } catch (error) {
      console.log('✅ Success: Error caught as expected');
      console.log('Error message:', error.message);
    }

    // Test case 4: Invalid spreadsheet ID
    const validTransaction = {
      date: new Date().toISOString(),
      type: 'income',
      amount: 1000000,
      category: 'Test',
      description: 'Test transaction'
    };

    console.log('\n📝 Test Case 4: Invalid Spreadsheet ID');
    console.log('Input:', JSON.stringify(validTransaction, null, 2));
    
    try {
      await appendTransactionToSheet('invalid-id', validTransaction);
      console.log('❌ Test failed: Should have thrown an error');
    } catch (error) {
      console.log('✅ Success: Error caught as expected');
      console.log('Error message:', error.message);
    }

    console.log('\n✨ All tests completed!');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    process.exit(1);
  }
}

// Run the tests
testSheets(); 
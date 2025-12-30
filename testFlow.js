const flow = require('./flowEngine');

async function testFullFlow() {
    const testJid = 'whatsapp_test_user@s.whatsapp.net';
    const testDni = '71078760'; // Real DNI from HuancayoBase

    console.log('=== Full Flow Test ===\n');

    // 1. Send DNI
    console.log('1. Sending DNI:', testDni);
    const res1 = await flow.runFlow(testDni, testJid);
    console.log('Response 1:', res1.substring(0, 100) + '...\n');

    // 2. Check cache was saved
    const sql = require('./utils/sqlServer');
    const cached = await sql.getCache(testJid);
    console.log('2. Cache check:', cached ? 'SAVED ✅' : 'NOT SAVED ❌');
    if (cached) {
        console.log('   DNI in cache:', cached.dni);
    }

    // 3. Send DNI again - should use cache
    console.log('\n3. Sending DNI again (should use cache):');
    const res2 = await flow.runFlow(testDni, testJid);
    console.log('Response 2:', res2.substring(0, 100) + '...\n');

    // 4. Select option 1 (Detalles deuda)
    console.log('4. Selecting option 1 (Detalles deuda):');
    const res3 = await flow.runFlow('1', testJid);
    console.log('Response 3:', res3 + '\n');

    // 5. Complex question
    console.log('5. Complex question (cuota + mora + total):');
    const res4 = await flow.runFlow('cual es la cuota pendiente y la mora total que debo pagar?', testJid);
    console.log('Response 4:', res4);

    console.log('\n=== Test Complete ===');
    process.exit(0);
}

testFullFlow();

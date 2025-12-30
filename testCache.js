const sql = require('./utils/sqlServer');

async function testCache() {
    try {
        console.log('=== Testing BotCache ===');

        // 1. Delete test record if exists
        await sql.query("DELETE FROM BotCache WHERE jid = 'test_simple'");
        console.log('1. Cleanup OK');

        // 2. Insert new record
        await sql.query(
            "INSERT INTO BotCache (jid, dni, clientData) VALUES (@p0, @p1, @p2)",
            ['test_simple', '12345678', '{"name":"Test"}']
        );
        console.log('2. INSERT OK');

        // 3. Check record
        const check = await sql.query("SELECT * FROM BotCache WHERE jid = @p0", ['test_simple']);
        console.log('3. Records found:', check.length);
        if (check.length > 0) {
            console.log('   DNI:', check[0].dni);
            console.log('   Data:', check[0].clientData);
        }

        // 4. Update record
        await sql.query(
            "UPDATE BotCache SET dni = @p0 WHERE jid = @p1",
            ['87654321', 'test_simple']
        );
        console.log('4. UPDATE OK');

        // 5. Verify update
        const verify = await sql.query("SELECT dni FROM BotCache WHERE jid = @p0", ['test_simple']);
        console.log('5. Updated DNI:', verify[0]?.dni);

        console.log('\n✅ All cache operations working!');

    } catch (err) {
        console.error('❌ ERROR:', err.message);
    }
    process.exit(0);
}

testCache();

/**
 * Message Templates for InformaPeru Chatbot
 * All bot responses are centralized here for easy maintenance
 */

const templates = {
    /**
     * Greeting with customer name (found in database)
     * @param {string} name - Customer name from NOMBRE_CLIENTE
     */
    greetingWithName(name) {
        return `Hola, *${name}* 😊 Soy Max, tu asistente virtual 🤖
Te saludamos de *InformaPeru*.
Para ayudarte escribe brevemente tu consulta *"Quiero pagar mi deuda"* o selecciona una opción:

1️⃣ Detalles deuda
2️⃣ Oficinas cercanas
3️⃣ Actualizar teléfono
4️⃣ Comunicarse con un asesor`;
    },

    /**
     * Neutral greeting (phone not found in database)
     */
    greetingNeutral() {
        return `Hola, Soy Max 😊, tu asistente virtual 🤖
Te saludamos de *InformaPeru*.

Para ayudarte con tu consulta, necesito tu *DNI* o *número de cuenta*.`;
    },

    /**
     * Menu options (after customer identified)
     * @param {string} name - Optional customer name
     */
    menuOptions(name = null) {
        const greeting = name ? `${name} 😊 ` : '';
        return `${greeting}Para continuar con la atención selecciona una opción:

1️⃣ Detalles deuda
2️⃣ Oficinas cercanas
3️⃣ Actualizar teléfono
4️⃣ Comunicarse con un asesor`;
    },

    /**
     * Request account number
     */
    askForAccount() {
        return `Voy a requerir tu *número de cuenta* para terminar con la validación 😊`;
    },

    /**
     * Request document/ID
     */
    askForDocument() {
        return `Por favor, bríndame tu *DNI* o *número de cuenta* para verificar en el sistema 🔍`;
    },

    /**
     * Invalid phone length error
     */
    invalidPhoneLength() {
        return `El número de teléfono brindado es incorrecto ❌
Debe poseer *9 dígitos* empezando sin el prefijo o símbolos:
Ejemplo: *9XX-XXX-XXX*`;
    },

    /**
     * Invalid account length error
     */
    invalidAccountLength() {
        return `El número de cuenta ingresado es incorrecto ❌
Debe poseer *18 dígitos*.
Por favor, verifica bien y vuelve a intentar.`;
    },

    /**
     * Phone/account not found - no debt
     */
    noDebtFound() {
        return `¡Felicitaciones! 🎉
Usted *no tiene una deuda pendiente* 😊`;
    },

    /**
     * Client not found in database
     */
    clientNotFound() {
        return `Lo siento, no encontré información asociada a ese número 😔
Por favor, verifica que esté correcto o intenta con tu *número de cuenta*.`;
    },

    /**
     * Session expired message
     */
    sessionExpired() {
        return `Tu sesión ha expirado por inactividad ⏰
Por favor, escríbenos nuevamente para continuar.`;
    },

    /**
     * Debt details template
     * @param {object} client - Client data from database
     */
    debtDetails(client) {
        const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
        const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
        const diasAtraso = client.DIAS_ATRASO || 0;
        const cuenta = client.CUENTA_CREDITO || 'N/A';

        return `📋 *Detalles de tu Deuda*

💰 Saldo Capital: S/ ${saldoCapital}
📅 Cuota Pendiente: S/ ${saldoCuota}
⏰ Días de atraso: ${diasAtraso}
📝 N° Cuenta: ${cuenta}

¿Deseas realizar otra consulta?`;
    },

    /**
     * Offices information
     */
    officesInfo() {
        return `📍 *Oficinas InformaPeru*

🏢 *Oficina Principal Huancayo*
   Dirección: Jr. Real 456, Huancayo
   Horario: Lun-Vie 8:00am - 6:00pm

🏢 *Oficina Lima*
   Dirección: Av. Larco 789, Miraflores
   Horario: Lun-Vie 9:00am - 6:00pm

📞 Central telefónica: 01-XXX-XXXX`;
    },

    /**
     * Update phone request
     */
    updatePhoneRequest() {
        return `Para actualizar tu número de teléfono, por favor escríbeme tu *nuevo número* en el siguiente formato:

Ejemplo: *987654321*`;
    },

    /**
     * Advisor transfer
     */
    advisorTransfer() {
        return `Listo ✅
Un asesor de *InformaPeru* ha sido notificado y se pondrá en contacto contigo a la brevedad.

⏰ Tiempo estimado de respuesta: 5-10 minutos`;
    },

    /**
     * Only debt information available
     */
    onlyDebtInfo() {
        return `Solo puedo brindarte información referente a tu deuda y orientarte a pagarlas.
¡Gracias! 😊`;
    },

    /**
     * Group message ignored
     */
    groupMessageIgnored() {
        return null; // Don't respond to groups
    },

    /**
     * Error fallback
     */
    errorFallback() {
        return `Lo siento, estoy experimentando una alta demanda 😅
Por favor, intenta de nuevo o escribe *"asesor"* para comunicarte con un representante.`;
    }
};

module.exports = templates;

/**
 * Excel Handler for New Phone Numbers
 * Saves unregistered phone numbers to data_nueva_telf.xlsx
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const EXCEL_PATH = path.resolve(__dirname, '..', 'data_nueva_telf.xlsx');

/**
 * Append a new phone record to the Excel file
 * @param {object} record - { CUENTA_CREDITO, NOMBRE_CLIENTE, telefono_nuevo }
 */
function appendNewPhone(record) {
    try {
        let workbook;
        let worksheet;
        let data = [];

        // Check if file exists
        if (fs.existsSync(EXCEL_PATH)) {
            // Read existing file
            workbook = XLSX.readFile(EXCEL_PATH);
            worksheet = workbook.Sheets[workbook.SheetNames[0]];
            data = XLSX.utils.sheet_to_json(worksheet);
        } else {
            // Create new workbook
            workbook = XLSX.utils.book_new();
        }

        // Check if phone already exists
        const exists = data.some(row => row.telefono_nuevo === record.telefono_nuevo);
        if (exists) {
            logger.debug('EXCEL', `Teléfono ya registrado: ${record.telefono_nuevo}`);
            return { success: true, duplicate: true };
        }

        // Add new record with timestamp
        const newRecord = {
            CUENTA_CREDITO: record.CUENTA_CREDITO || '',
            NOMBRE_CLIENTE: record.NOMBRE_CLIENTE || '',
            telefono_nuevo: record.telefono_nuevo,
            fecha_registro: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })
        };
        data.push(newRecord);

        // Create new worksheet from data
        const newWorksheet = XLSX.utils.json_to_sheet(data);

        // Set column widths
        newWorksheet['!cols'] = [
            { wch: 22 }, // CUENTA_CREDITO
            { wch: 40 }, // NOMBRE_CLIENTE
            { wch: 15 }, // telefono_nuevo
            { wch: 22 }  // fecha_registro
        ];

        // Replace or add worksheet
        if (workbook.SheetNames.length > 0) {
            workbook.Sheets[workbook.SheetNames[0]] = newWorksheet;
        } else {
            XLSX.utils.book_append_sheet(workbook, newWorksheet, 'Telefonos_Nuevos');
        }

        // Write file
        XLSX.writeFile(workbook, EXCEL_PATH);

        logger.success('EXCEL', `Nuevo teléfono agregado: ${record.telefono_nuevo}`);
        logger.phone(record.telefono_nuevo, false, record);

        return { success: true, duplicate: false };

    } catch (err) {
        logger.error('EXCEL', 'Error al guardar en Excel', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get all registered new phones
 * @returns {array} List of phone records
 */
function getAllNewPhones() {
    try {
        if (!fs.existsSync(EXCEL_PATH)) {
            return [];
        }
        const workbook = XLSX.readFile(EXCEL_PATH);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_json(worksheet);
    } catch (err) {
        logger.error('EXCEL', 'Error al leer Excel', err);
        return [];
    }
}

/**
 * Update an existing phone record with account/name info
 * @param {string} telefono - Phone number to update
 * @param {object} data - { CUENTA_CREDITO, NOMBRE_CLIENTE }
 */
function updatePhoneRecord(telefono, data) {
    try {
        if (!fs.existsSync(EXCEL_PATH)) {
            return { success: false, error: 'File not found' };
        }

        const workbook = XLSX.readFile(EXCEL_PATH);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        let records = XLSX.utils.sheet_to_json(worksheet);

        // Find and update the record
        let updated = false;
        records = records.map(row => {
            if (row.telefono_nuevo === telefono) {
                updated = true;
                return {
                    ...row,
                    CUENTA_CREDITO: data.CUENTA_CREDITO || row.CUENTA_CREDITO || '',
                    NOMBRE_CLIENTE: data.NOMBRE_CLIENTE || row.NOMBRE_CLIENTE || '',
                    fecha_actualizacion: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })
                };
            }
            return row;
        });

        if (updated) {
            const newWorksheet = XLSX.utils.json_to_sheet(records);
            newWorksheet['!cols'] = [
                { wch: 22 }, // CUENTA_CREDITO
                { wch: 40 }, // NOMBRE_CLIENTE
                { wch: 15 }, // telefono_nuevo
                { wch: 22 }, // fecha_registro
                { wch: 22 }  // fecha_actualizacion
            ];
            workbook.Sheets[workbook.SheetNames[0]] = newWorksheet;
            XLSX.writeFile(workbook, EXCEL_PATH);

            logger.success('EXCEL', `Registro actualizado para: ${telefono}`);
            return { success: true };
        }

        return { success: false, error: 'Phone not found' };

    } catch (err) {
        logger.error('EXCEL', 'Error al actualizar Excel', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get count of new phones
 * @returns {number} Count of registered phones
 */
function getNewPhonesCount() {
    return getAllNewPhones().length;
}

module.exports = {
    appendNewPhone,
    getAllNewPhones,
    updatePhoneRecord,
    getNewPhonesCount
};

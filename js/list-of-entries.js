// js/list-of-entries.js
(() => {
    // SECTION 1: DOM Element Selection & Configuration
    if (typeof supabase === 'undefined' || !supabase) {
        console.error("Supabase client is not available in list-of-entries.js.");
        return;
    }

    // --- Config & State ---
    const ENTRIES_TABLE = 'main_entries';
    const CLIENTS_TABLE = 'clients'; 
    const AVAILABLE_ENTRIES_TABLE = 'available_entry_numbers';
    const BUCKET_NAME = 'entriesdocs';
    let currentUserLE = null;
    let isModuleInitializedLE = false;
    let entriesDataTable, historyDataTable;
    let currentEntryIdForDocs = null;
    let allEntriesData = [];
    let historyYearsPopulated = false;
    let originalEntryStatus = {}; 

    const dutyTypes = ['Duties', 'Potato fee', 'Dairy fee', 'Watermelon fee', 'Honey fee'];
    const dutyUnits = ['$', 'kg', 'L', 'unit'];

    // --- Element Caching ---
    const entriesTableElement = document.getElementById('entriesTable');
    const addNewEntryBtn = document.getElementById('addNewEntryBtn');
    const addEntryNumbersBtn = document.getElementById('addEntryNumbersBtn');
    const entryFormModal = document.getElementById('entryFormModal');
    const entryFormModalTitle = document.getElementById('entryFormModalTitle');
    const closeEntryFormModalBtn = document.getElementById('closeEntryFormModalBtn');
    const cancelEntryFormBtn = document.getElementById('cancelEntryFormBtn');
    const entryForm = document.getElementById('entryForm');
    const saveEntryBtn = document.getElementById('saveEntryBtn');
    const entryIdInput = document.getElementById('entryId');
    const customerTypeSelect = document.getElementById('le-customer-type-select');
    // MODIFIED: Updated the selector for the new customer name input field.
    const customerNameInput = document.getElementById('le-customer-name-input');
    const entryNumberSelect = document.getElementById('le-entry-number-select');
    const entryDetailsSection = document.getElementById('entryDetailsSection');
    const dutiesContainer = document.getElementById('le-duties-container');
    const addDutyLineBtn = document.getElementById('addDutyLineBtn');
    const invoiceInput = document.getElementById('le-invoice-input');
    const notesInput = document.getElementById('le-notes-input');
    const bondTypeError = document.getElementById('bondTypeError');
    const fdaStatusSelect = document.getElementById('le-fda-status-select');
    const cargoReleaseSelect = document.getElementById('le-cargo-release-select');
    const statusGroup = document.getElementById('le-status-group');
    const statusSelect = document.getElementById('le-status-select');
    const viewEntryModal = document.getElementById('viewEntryModal');
    const viewEntryModalTitle = document.getElementById('viewEntryModalTitle');
    const viewEntryDetailsBody = document.getElementById('viewEntryDetailsBody');
    const closeViewEntryModalBtn = document.getElementById('closeViewEntryModalBtn');
    const closeViewEntryFooterBtn = document.getElementById('closeViewEntryFooterBtn');
    const leDocManagementModal = document.getElementById('leDocManagementModal');
    const leDocModalTitle = document.getElementById('leDocModalTitle');
    const leCloseDocModalBtn = document.getElementById('leCloseDocModalBtn');
    const leDocFileInput = document.getElementById('leDocFileInput');
    const leUploadDocBtn = document.getElementById('leUploadDocBtn');
    const leDocListContainer = document.getElementById('leDocListContainer');
    const leNoDocsMessage = document.getElementById('leNoDocsMessage');
    const leCloseDocModalFooterBtn = document.getElementById('leCloseDocModalFooterBtn');
    const leCustomConfirmModal = document.getElementById('leCustomConfirmModal');
    const leCustomConfirmTitle = document.getElementById('leCustomConfirmTitle');
    const leCustomConfirmMessage = document.getElementById('leCustomConfirmMessage');
    const leCustomConfirmOkBtn = document.getElementById('leCustomConfirmOkBtn');
    const leCustomConfirmCancelBtn = document.getElementById('leCustomConfirmCancelBtn');
    const leCustomConfirmCloseBtn = document.getElementById('leCustomConfirmCloseBtn');
    let currentConfirmCallback = null;
    const addEntryNumbersModal = document.getElementById('addEntryNumbersModal');
    const closeEntryNumbersModalBtn = document.getElementById('closeEntryNumbersModalBtn');
    const cancelCsvUploadBtn = document.getElementById('cancelCsvUploadBtn');
    const processCsvBtn = document.getElementById('processCsvBtn');
    const csvUploadInput = document.getElementById('csvUploadInput');
    const csvProcessingResultsDiv = document.getElementById('csv-processing-results');
    const csvResultsMessage = document.getElementById('csvResultsMessage');
    const dbTotalEntriesEl = document.getElementById('db-total-entries');
    const dbInProgressEntriesEl = document.getElementById('db-inprogress-entries');
    const dbCompletedEntriesEl = document.getElementById('db-completed-entries');
    const dbCancelledEntriesEl = document.getElementById('db-cancelled-entries');
    const openHistoryModalBtn = document.getElementById('openHistoryModalBtn');
    const historyModal = document.getElementById('historyModal');
    const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
    const closeHistoryFooterBtn = document.getElementById('closeHistoryFooterBtn');
    const historyTableElement = document.getElementById('historyTable');
    const historyCustomerTypeSelect = document.getElementById('historyCustomerType');
    const historyCustomerNameInput = document.getElementById('historyCustomerName');
    const historyMonthSelect = document.getElementById('historyMonth');
    const historyYearSelect = document.getElementById('historyYear');
    const filterHistoryBtn = document.getElementById('filterHistoryBtn');
    const historyTotalResultsEl = document.getElementById('historyTotalResults');
    const noHistoryResultsMessageEl = document.getElementById('noHistoryResultsMessage');
    const manualEmailModal = document.getElementById('manualEmailModal');
    const manualEmailInput = document.getElementById('manualEmailInput');
    const manualEmailOkBtn = document.getElementById('manualEmailOkBtn');
    const manualEmailCancelBtn = document.getElementById('manualEmailCancelBtn');
    const sendingNotificationModal = document.getElementById('sendingNotificationModal');
    let notificationEntryData = null; 


    // SECTION 2: UTILITY & MODAL FUNCTIONS
    function showLENotification(message, type = 'info', duration = 4000) {
        const container = document.getElementById('customNotificationContainerLE');
        if (!container) return;
        const notification = document.createElement("div");
        notification.className = `custom-notification-st ${type}`;
        let iconClass = 'bx bx-info-circle';
        if (type === 'success') iconClass = 'bx bx-check-circle';
        if (type === 'error') iconClass = 'bx bx-x-circle';
        notification.innerHTML = `<i class='${iconClass}'></i><span>${message}</span>`;
        container.appendChild(notification);
        container.style.display = 'block';
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 500);
        }, duration);
    }

    function openLeModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = 'flex';
            setTimeout(() => modalElement.classList.add('le-modal-open'), 10);
        }
    }

    function closeLeModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove('le-modal-open');
            setTimeout(() => { modalElement.style.display = 'none'; }, 300);
        }
    }

    function showConfirmModal(title, message, onOk) {
        leCustomConfirmTitle.textContent = title;
        leCustomConfirmMessage.innerHTML = message;
        currentConfirmCallback = onOk;
        openLeModal(leCustomConfirmModal);
    }

    function getFileIconClass(fileName) {
        if (!fileName) return "bxs-file-blank";
        const extension = fileName.split(".").pop().toLowerCase();
        switch (extension) {
            case "pdf": return "bxs-file-pdf";
            case "doc": case "docx": return "bxs-file-doc";
            case "xls": case "xlsx": case "csv": return "bxs-spreadsheet";
            case "jpg": case "jpeg": case "png": case "gif": return "bxs-file-image";
            default: return "bxs-file-blank";
        }
    }

    function parseCSV(csvText) {
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotedField = false;
        csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];

            if (inQuotedField) {
                if (char === '"') {
                    if (csvText[i + 1] === '"') {
                        currentField += '"';
                        i++;
                    } else {
                        inQuotedField = false;
                    }
                } else {
                    currentField += char;
                }
            } else {
                if (char === ',') {
                    currentRow.push(currentField);
                    currentField = '';
                } else if (char === '\n') {
                    currentRow.push(currentField);
                    rows.push(currentRow);
                    currentRow = [];
                    currentField = '';
                } else if (char === '"' && currentField.length === 0) {
                    inQuotedField = true;
                } else {
                    currentField += char;
                }
            }
        }
        if (currentField.length > 0 || currentRow.length > 0) {
            currentRow.push(currentField);
            rows.push(currentRow);
        }
        return rows.filter(row => row.length > 1 || (row.length === 1 && row[0] !== ''));
    }


    // SECTION 3: DATATABLE INITIALIZATION
    function initializeEntriesTable(data) {
        if ($.fn.DataTable.isDataTable(entriesTableElement)) {
            entriesDataTable.clear().rows.add(data).draw();
            return;
        }

        entriesDataTable = $(entriesTableElement).DataTable({
            data: data,
            responsive: true,
            scrollX: true,
            columns: [
                { data: 'entry_number', title: 'Entry Number', className: 'dt-left' },
                { data: 'customer_name', title: 'Customer', className: 'dt-left' },
                { data: 'created_at', title: 'Date', className: 'dt-center', render: (d) => d ? new Date(d).toLocaleDateString() : 'N/A' },
                { data: 'invoice', title: 'Invoice', className: 'dt-center', defaultContent: '' },
                {
                    data: 'duties',
                    title: 'Duties',
                    className: 'dt-center',
                    render: (duties) => {
                        if (duties && duties.length > 0) {
                            return "<span class='le-status-badge status-completed' style='background-color: #2a9d8f;'>Yes</span>";
                        }
                        return "<span class='le-status-badge status-cancelled' style='background-color: #e31837;'>No</span>";
                    }
                },
                { data: 'bond_type', title: 'Bond', className: 'dt-center' },
                {
                    data: 'fda_status',
                    title: 'FDA Status',
                    className: 'dt-center',
                    render: (status) => {
                        const safeStatus = (status || 'Hold').toLowerCase().replace(/\s/g, '-');
                        return `<span class="le-status-badge status-${safeStatus}">${status || 'Hold'}</span>`;
                    }
                },
                {
                    data: 'cargo_release',
                    title: 'Cargo Release',
                    className: 'dt-center',
                    render: (status) => {
                        const safeStatus = (status || 'Pending').toLowerCase().replace(/\s/g, '-');
                        return `<span class="le-status-badge status-${safeStatus}">${status || 'Pending'}</span>`;
                    }
                },
                {
                    data: 'status',
                    title: 'Status',
                    className: 'dt-center',
                    render: (status) => {
                        const safeStatus = (status || 'In Progress').toLowerCase().replace(/\s/g, '-');
                        return `<span class="le-status-badge status-${safeStatus}">${status || 'In Progress'}</span>`;
                    }
                },
                { data: 'user_name', title: 'User', className: 'dt-left' },
                {
                    data: null,
                    title: 'Actions',
                    orderable: false,
                    searchable: false,
                    className: "dt-center le-actions-column",
                    render: (data, type, row) => `
                        <div class="le-table-actions">
                            <button data-action="complete" title="Complete Entry" ${row.status === 'Completed' ? 'disabled' : ''}><i class='bx bx-check-square'></i></button>
                            <button data-action="delete" title="Delete Entry"><i class='bx bx-trash'></i></button>
                        </div>
                    `
                },
                {
                    data: null,
                    title: 'View/Edit',
                    orderable: false,
                    searchable: false,
                    className: "dt-center le-actions-column",
                    render: () => `
                        <div class="le-table-actions">
                            <button data-action="view" title="View Details"><i class='bx bx-show'></i></button>
                            <button data-action="edit" title="Edit Entry"><i class='bx bx-edit'></i></button>
                        </div>
                    `
                },
                {
                    data: null,
                    title: 'Docs',
                    orderable: false,
                    searchable: false,
                    className: "dt-center le-actions-column",
                    render: () => `
                        <div class="le-table-actions">
                            <button data-action="docs" title="Manage Documents"><i class='bx bx-file'></i> Docs</button>
                        </div>
                    `
                }
            ],
            language: { search: "Search:", emptyTable: "No active entries recorded yet." },
            order: [[2, 'desc']]
        });
    }

    function initializeHistoryTable(data) {
        if ($.fn.DataTable.isDataTable(historyTableElement)) {
            historyDataTable.clear().rows.add(data).draw();
            return;
        }
        historyDataTable = $(historyTableElement).DataTable({
            data: data,
            responsive: true,
            scrollX: true,
            columns: [
                { data: 'entry_number', title: 'Entry Number', className: 'dt-center' },
                { data: 'customer_name', title: 'Customer', className: 'dt-center' },
                { data: 'created_at', title: 'Creation Date', className: 'dt-center', render: (d) => d ? new Date(d).toLocaleDateString() : 'N/A' },
                { data: 'updated_at', title: 'Completion Date', className: 'dt-center', render: (d) => d ? new Date(d).toLocaleDateString() : 'N/A' },
                {
                    data: 'status',
                    title: 'Status',
                    className: 'dt-center',
                    render: (status) => {
                        const safeStatus = (status || '').toLowerCase().replace(/\s/g, '-');
                        return `<span class="le-status-badge status-${safeStatus}">${status}</span>`;
                    }
                },
                { data: 'user_name', title: 'User', className: 'dt-center' },
                {
                    data: null,
                    title: 'View/Edit',
                    orderable: false,
                    searchable: false,
                    className: "dt-center le-actions-column",
                    render: () => `
                        <div class="le-table-actions">
                            <button data-action="view" title="View Details"><i class='bx bx-show'></i></button>
                            <button data-action="edit" title="Edit Entry"><i class='bx bx-edit'></i></button>
                        </div>
                    `
                },
                {
                    data: null,
                    title: 'Docs',
                    orderable: false,
                    searchable: false,
                    className: "dt-center le-actions-column",
                    render: () => `
                        <div class="le-table-actions">
                            <button data-action="docs" title="Manage Documents"><i class='bx bx-file'></i> Docs</button>
                        </div>
                    `
                },
                {
                    data: null,
                    title: 'Delete',
                    orderable: false,
                    searchable: false,
                    className: "dt-center le-actions-column",
                    render: () => `
                        <div class="le-table-actions">
                            <button data-action="delete" title="Delete Entry"><i class='bx bx-trash'></i></button>
                        </div>
                    `
                }
            ],
            language: { search: "Search History:", emptyTable: "No historical entries found." },
            order: [[3, 'desc']]
        });
    }

    // SECTION 4: CORE LOGIC & DATABASE INTERACTIONS
    async function fetchAllEntries() {
        if (!currentUserLE) return;
        const { data, error } = await supabase.from(ENTRIES_TABLE).select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching entries:', error);
            showLENotification('Failed to load entries.', 'error');
            return;
        }
        allEntriesData = data;
        const activeEntries = allEntriesData.filter(e => e.status === 'In Progress');
        initializeEntriesTable(activeEntries);
        updateDashboard();
    }

    async function saveEntry() {
        if (!currentUserLE) return showLENotification('You must be logged in.', 'error');

        const bondSelected = document.querySelector('input[name="bondType"]:checked');
        if (!bondSelected) {
            bondTypeError.style.display = 'block';
            return;
        }
        bondTypeError.style.display = 'none';

        saveEntryBtn.disabled = true;
        saveEntryBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Saving...";

        const duties = Array.from(dutiesContainer.querySelectorAll('.le-duty-line')).map(line => ({
            type: line.querySelector('select:nth-child(1)').value,
            value: parseFloat(line.querySelector('input').value),
            unit: line.querySelector('select:nth-child(3)').value,
        })).filter(d => d.type && !isNaN(d.value) && d.unit);

        const entryId = entryIdInput.value;
        const dataToSave = {
            customer_type: customerTypeSelect.value,
            // MODIFIED: Read value from the new text input field.
            customer_name: customerNameInput.value.trim(),
            entry_number: entryNumberSelect.value,
            invoice: invoiceInput.value.trim() || null,
            duties: duties,
            bond_type: bondSelected.value,
            fda_status: fdaStatusSelect.value,
            cargo_release: cargoReleaseSelect.value,
            notes: notesInput.value.trim() || null,
            user_email: currentUserLE.email,
            user_name: currentUserLE.user_metadata?.full_name || currentUserLE.email,
            status: statusSelect.value,
            updated_at: new Date().toISOString()
        };

        let result;
        if (entryId) {
            result = await supabase.from(ENTRIES_TABLE).update(dataToSave).eq('id', entryId).select().single();
        } else {
            dataToSave.status = 'In Progress';
            result = await supabase.from(ENTRIES_TABLE).insert(dataToSave).select().single();
            if (!result.error) {
                await supabase.from(AVAILABLE_ENTRIES_TABLE).update({ is_used: true }).eq('entry_number', dataToSave.entry_number);
            }
        }

        saveEntryBtn.disabled = false;
        saveEntryBtn.textContent = "Save Entry";

        if (result.error) {
            showLENotification(`Error saving entry: ${result.error.message}`, 'error');
            console.error('Save Entry Error:', result.error);
        } else {
            showLENotification(`Entry ${entryId ? 'updated' : 'created'} successfully!`, 'success');
            closeLeModal(entryFormModal);
            await fetchAllEntries(); 
            
            handleStatusChange(originalEntryStatus, result.data);
        }
    }

    async function deleteEntry(entryId, entryNumber) {
        if (!currentUserLE) return;
        const entryToDelete = allEntriesData.find(e => e.id === entryId);
        if (!entryToDelete) return;

        if (entryToDelete.documents && entryToDelete.documents.length > 0) {
            const filePaths = entryToDelete.documents.map(doc => doc.file_path);
            const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove(filePaths);
            if (storageError) {
                showLENotification(`Could not delete associated files, but deleting record. Error: ${storageError.message}`, 'warning');
            }
        }

        const { error: deleteError } = await supabase.from(ENTRIES_TABLE).delete().eq('id', entryId);
        if (deleteError) {
            showLENotification(`Error deleting entry: ${deleteError.message}`, 'error');
            return;
        }

        await supabase.from(AVAILABLE_ENTRIES_TABLE).update({ is_used: false }).eq('entry_number', entryNumber);
        showLENotification('Entry deleted successfully.', 'success');
        await fetchAllEntries();
    }

    async function completeEntry(entryId) {
        if (!currentUserLE) return;
        const originalEntry = allEntriesData.find(e => e.id === entryId);
        if (!originalEntry) return;

        const { data, error } = await supabase.from(ENTRIES_TABLE).update({ status: 'Completed', updated_at: new Date().toISOString() }).eq('id', entryId).select().single();
        if (error) {
            showLENotification(`Error completing entry: ${error.message}`, 'error');
        } else {
            showLENotification('Entry marked as completed.', 'success');
            await fetchAllEntries();
            handleStatusChange(originalEntry, data);
        }
    }

    // SECTION 5: MODAL & FORM HANDLING
    function resetEntryForm() {
        entryForm.reset();
        entryIdInput.value = '';
        originalEntryStatus = {}; 
        customerTypeSelect.disabled = false;
        // MODIFIED: Reset logic for the new text input.
        customerNameInput.value = '';
        customerNameInput.disabled = true;
        entryNumberSelect.innerHTML = '<option value="">Select type first...</option>';
        entryNumberSelect.disabled = true;
        dutiesContainer.innerHTML = '';
        fdaStatusSelect.value = 'Hold';
        cargoReleaseSelect.value = 'Pending';
        entryDetailsSection.classList.remove('visible');
        saveEntryBtn.disabled = true;
        statusGroup.style.display = 'none';
    }

    async function populateEntryForm(entry) {
        await populateCustomerTypes();
        if (entry) {
            originalEntryStatus = {
                fda_status: entry.fda_status,
                cargo_release: entry.cargo_release,
                status: entry.status
            };

            entryFormModalTitle.innerHTML = `<i class='bx bx-edit-alt'></i> Edit Entry - ${entry.entry_number}`;
            entryIdInput.value = entry.id;
            customerTypeSelect.value = entry.customer_type;
            customerTypeSelect.disabled = true;

            // MODIFIED: Populate the text input instead of a select.
            customerNameInput.value = entry.customer_name;
            customerNameInput.disabled = true; // Keep it disabled during edit.

            // MODIFIED: Fetch entries for the type.
            await fetchAvailableEntriesForType(entry.customer_type, entry.entry_number, true);
            entryNumberSelect.disabled = true;
            
            invoiceInput.value = entry.invoice || '';
            notesInput.value = entry.notes || '';
            document.querySelector(`input[name="bondType"][value="${entry.bond_type}"]`).checked = true;
            fdaStatusSelect.value = entry.fda_status || 'Hold';
            cargoReleaseSelect.value = entry.cargo_release || 'Pending';
            dutiesContainer.innerHTML = '';
            (entry.duties || []).forEach(addDutyLineFromData);
            statusSelect.value = entry.status || 'In Progress';
            statusGroup.style.display = 'block';
            entryDetailsSection.classList.add('visible');
            saveEntryBtn.disabled = false;
        } else {
            entryFormModalTitle.innerHTML = "<i class='bx bx-plus-circle'></i> Add New Entry";
            statusGroup.style.display = 'none';
        }
    }

    function populateViewModal(entry) {
        viewEntryModalTitle.innerHTML = `<i class='bx bx-show-alt'></i> Entry Details - ${entry.entry_number}`;
        let dutiesHtml = '<p>No duties recorded.</p>';
        if (entry.duties && entry.duties.length > 0) {
            dutiesHtml = entry.duties.map(d => `<li><span class="le-duty-name">${d.type}</span> <span class="le-duty-value">${d.value} ${d.unit}</span></li>`).join('');
            dutiesHtml = `<ul class="le-duties-view-container">${dutiesHtml}</ul>`;
        }
        const safeStatus = (entry.status || 'In Progress').toLowerCase().replace(/\s/g, '-');
        const safeFdaStatus = (entry.fda_status || 'Hold').toLowerCase().replace(/\s/g, '-');
        const safeCargoStatus = (entry.cargo_release || 'Pending').toLowerCase().replace(/\s/g, '-');

        viewEntryDetailsBody.innerHTML = `
            <div class="le-detail-section">
                <h4><i class='bx bx-info-circle'></i> General Information</h4>
                <div class="le-detail-grid">
                    <div class="le-detail-group"><span class="le-detail-label">Entry Number:</span><span class="le-detail-value">${entry.entry_number}</span></div>
                    <div class="le-detail-group"><span class="le-detail-label">Customer:</span><span class="le-detail-value">${entry.customer_name}</span></div>
                    <div class="le-detail-group"><span class="le-detail-label">Customer Type:</span><span class="le-detail-value">${entry.customer_type}</span></div>
                    <div class="le-detail-group"><span class="le-detail-label">Date:</span><span class="le-detail-value">${new Date(entry.created_at).toLocaleDateString()}</span></div>
                    <div class="le-detail-group"><span class="le-detail-label">Invoice:</span><span class="le-detail-value">${entry.invoice || 'N/A'}</span></div>
                    <div class="le-detail-group"><span class="le-detail-label">Bond Type:</span><span class="le-detail-value">${entry.bond_type}</span></div>
                    <div class="le-detail-group"><span class="le-detail-label">Status:</span><span class="le-detail-value"><span class="le-status-badge status-${safeStatus}">${entry.status}</span></span></div>
                    <div class="le-detail-group"><span class="le-detail-label">FDA Status:</span><span class="le-detail-value"><span class="le-status-badge status-${safeFdaStatus}">${entry.fda_status || 'Hold'}</span></span></div>
                    <div class="le-detail-group"><span class="le-detail-label">Cargo Release:</span><span class="le-detail-value"><span class="le-status-badge status-${safeCargoStatus}">${entry.cargo_release || 'Pending'}</span></span></div>
                    <div class="le-detail-group"><span class="le-detail-label">User:</span><span class="le-detail-value">${entry.user_name}</span></div>
                </div>
            </div>
            <div class="le-detail-section">
                <h4><i class='bx bx-dollar-circle'></i> Duties</h4>
                ${dutiesHtml}
            </div>
            <div class="le-detail-section">
                <h4><i class='bx bx-note'></i> Notes</h4>
                <p class="le-detail-value">${entry.notes || 'No notes provided.'}</p>
            </div>
        `;
        openLeModal(viewEntryModal);
    }

    // SECTION 6: DOCUMENT MANAGEMENT
    async function uploadEntryDocument() {
        if (!currentEntryIdForDocs || !leDocFileInput.files[0]) return;
        leUploadDocBtn.disabled = true;
        const file = leDocFileInput.files[0];
        const entry = allEntriesData.find(e => e.id === currentEntryIdForDocs);
        const filePath = `${currentUserLE.id}/${currentEntryIdForDocs}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file);

        if (uploadError) {
            showLENotification(`Upload error: ${uploadError.message}`, 'error');
            leUploadDocBtn.disabled = false;
            return;
        }

        const newDocument = {
            id: `doc_${Date.now()}`,
            file_name: file.name,
            file_path: filePath,
            uploaded_at: new Date().toISOString()
        };

        const updatedDocuments = [...(entry.documents || []), newDocument];
        const { error: dbError } = await supabase.from(ENTRIES_TABLE).update({ documents: updatedDocuments }).eq('id', currentEntryIdForDocs);

        leUploadDocBtn.disabled = false;
        if (dbError) {
            showLENotification(`Failed to save document record: ${dbError.message}`, 'error');
        } else {
            showLENotification('Document uploaded successfully!', 'success');
            entry.documents = updatedDocuments;
            renderEntryDocuments();
            leDocFileInput.value = '';
        }
    }

    function renderEntryDocuments() {
        const entry = allEntriesData.find(e => e.id === currentEntryIdForDocs);
        leDocListContainer.innerHTML = '';
        if (entry && entry.documents && entry.documents.length > 0) {
            leNoDocsMessage.style.display = 'none';
            entry.documents.forEach(doc => {
                const card = document.createElement("div");
                card.className = "le-doc-card";
                card.innerHTML = `
                    <div class="le-doc-card-icon"><i class='bx ${getFileIconClass(doc.file_name)}'></i></div>
                    <div class="le-doc-card-info">
                        <span class="le-doc-card-name">${doc.file_name}</span>
                    </div>
                    <div class="le-doc-card-actions">
                        <button data-action="download" data-path="${doc.file_path}" title="Download"><i class='bx bxs-download'></i></button>
                        <button data-action="delete" data-id="${doc.id}" data-path="${doc.file_path}" title="Delete"><i class='bx bxs-trash'></i></button>
                    </div>`;
                leDocListContainer.appendChild(card);
            });
        } else {
            leNoDocsMessage.style.display = 'block';
        }
    }

    async function handleDocumentAction(event) {
        const button = event.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        const path = button.dataset.path;
        const docId = button.dataset.id;
        const entry = allEntriesData.find(e => e.id === currentEntryIdForDocs);

        if (action === 'download') {
            const { data, error } = await supabase.storage.from(BUCKET_NAME).download(path);
            if (error) return showLENotification(`Download error: ${error.message}`, 'error');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(data);
            link.download = path.split('/').pop();
            link.click();
            URL.revokeObjectURL(link.href);
        } else if (action === 'delete') {
            showConfirmModal('Delete Document', 'Are you sure you want to permanently delete this document?', async () => {
                const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove([path]);
                if (storageError) return showLENotification(`Storage error: ${storageError.message}`, 'error');
                const updatedDocuments = entry.documents.filter(d => d.id !== docId);
                const { error: dbError } = await supabase.from(ENTRIES_TABLE).update({ documents: updatedDocuments }).eq('id', entry.id);
                if (dbError) return showLENotification(`DB update error: ${dbError.message}`, 'error');
                showLENotification('Document deleted successfully.', 'success');
                entry.documents = updatedDocuments;
                renderEntryDocuments();
            });
        }
    }

    // SECTION 7: NOTIFICATION LOGIC (GMAIL VERSION)
    async function signInWithGmailScope() {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'https://www.googleapis.com/auth/gmail.send',
            },
        });
        if (error) {
            console.error('Error getting Gmail scope:', error);
            showLENotification('Could not get permission to send emails.', 'error');
        }
    }

    function handleStatusChange(originalStatus, updatedEntry) {
        if (!originalStatus || !updatedEntry) return;

        const fdaChanged = originalStatus.fda_status !== updatedEntry.fda_status;
        const cargoChanged = originalStatus.cargo_release !== updatedEntry.cargo_release;
        const statusChanged = originalStatus.status !== updatedEntry.status;

        if (fdaChanged || cargoChanged || statusChanged) {
            console.log("Status change detected. Triggering notification process.");
            triggerNotificationProcess(updatedEntry);
        }
    }

    async function triggerNotificationProcess(entryData) {
        const { data: client, error } = await supabase
            .from(CLIENTS_TABLE)
            .select('email')
            .ilike('company_name', entryData.customer_name)
            .single();

        if (error || !client || !client.email) {
            console.warn(`Customer email not found for: ${entryData.customer_name}. Opening manual input modal.`);
            notificationEntryData = entryData; 
            openLeModal(manualEmailModal);
        } else {
            console.log(`Email found for ${entryData.customer_name}: ${client.email}. Sending notification.`);
            sendNotification(entryData, client.email);
        }
    }

    async function sendNotification(entryData, recipientEmail) {
        openLeModal(sendingNotificationModal);

        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
                throw new Error('Could not get user session. Please sign in again.');
            }

            const { provider_token, user } = session;
            if (!provider_token) {
                // This means the user needs to grant the gmail.send scope
                closeLeModal(sendingNotificationModal);
                await signInWithGmailScope();
                // After the user grants permission, they will be redirected back.
                // The action will need to be re-initiated by the user.
                // A more advanced implementation could store the pending action in localStorage.
                showLENotification('Permission required. Please try the action again.', 'info');
                return;
            }

            const { error: functionError } = await supabase.functions.invoke('send-gmail-notification', {
                body: {
                    entry: entryData,
                    email: recipientEmail,
                    provider_token: provider_token,
                    from_email: user.email
                },
            });

            if (functionError) throw functionError;

            showLENotification('Notification sent successfully!', 'success');
        } catch (error) {
            console.error('Error during notification process:', error);
            showLENotification(`Failed to send notification: ${error.message}`, 'error');
        } finally {
            closeLeModal(sendingNotificationModal);
        }
    }


    // SECTION 8: EVENT LISTENERS & FORM HELPERS
    function addDutyLineFromData(duty) {
        const line = document.createElement('div');
        line.className = 'le-duty-line';

        const typeSelect = document.createElement('select');
        typeSelect.innerHTML = dutyTypes.map(t => `<option value="${t}" ${duty && duty.type === t ? 'selected' : ''}>${t}</option>`).join('');

        const valueInput = document.createElement('input');
        valueInput.type = 'number';
        valueInput.placeholder = 'Value';
        valueInput.step = '0.01';
        valueInput.value = duty ? duty.value : '';
        valueInput.required = true;

        const unitSelect = document.createElement('select');
        unitSelect.innerHTML = dutyUnits.map(u => `<option value="${u}" ${duty && duty.unit === u ? 'selected' : ''}>${u}</option>`).join('');

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'le-remove-duty-btn';
        removeBtn.innerHTML = "<i class='bx bx-trash'></i>";
        removeBtn.onclick = () => line.remove();

        line.append(typeSelect, valueInput, unitSelect, removeBtn);
        dutiesContainer.appendChild(line);
    }

    async function populateCustomerTypes(selectElement = customerTypeSelect) {
        const { data, error } = await supabase.from(AVAILABLE_ENTRIES_TABLE).select('customer_type');
        if (error) { console.error("Error fetching customer types:", error); return; }
        const uniqueTypes = [...new Set(data.map(item => item.customer_type))].sort();
        selectElement.innerHTML = '<option value="">All Types</option>';
        uniqueTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            selectElement.appendChild(option);
        });
    }

    // MODIFIED: This function is no longer needed with the new logic.
    /*
    async function fetchCustomersForType(customerType, selectedCustomer = null) {
        // ... (code removed)
    }
    */

    // MODIFIED: Renamed and changed this function to fetch entries based on Customer Type.
    async function fetchAvailableEntriesForType(customerType, selectedEntry = null, isEditing = false) {
        entryNumberSelect.innerHTML = '<option>Loading...</option>';
        entryNumberSelect.disabled = true;
        // MODIFIED: Query is now based on customer_type instead of customer_name.
        let query = supabase.from(AVAILABLE_ENTRIES_TABLE).select('entry_number').eq('customer_type', customerType);
        if (!isEditing) {
            query = query.eq('is_used', false);
        }
        const { data, error } = await query;
        if (error) { entryNumberSelect.innerHTML = '<option>Error loading</option>'; return; }
        entryNumberSelect.innerHTML = '<option value="" selected disabled>Select entry...</option>';
        if (isEditing && selectedEntry) {
            const option = document.createElement('option');
            option.value = selectedEntry;
            option.textContent = selectedEntry;
            option.selected = true;
            entryNumberSelect.appendChild(option);
        }
        (data || []).forEach(item => {
            if (item.entry_number !== selectedEntry) {
                const option = document.createElement('option');
                option.value = item.entry_number;
                option.textContent = item.entry_number;
                entryNumberSelect.appendChild(option);
            }
        });
        entryNumberSelect.disabled = false;
    }

    function resetCsvModal() {
        csvUploadInput.value = '';
        processCsvBtn.disabled = true;
        csvProcessingResultsDiv.style.display = 'none';
        csvResultsMessage.textContent = '';
    }

    // MODIFIED: This function is completely overhauled for the new 2-column CSV format.
    async function handleProcessCsv() {
        const file = csvUploadInput.files[0];
        if (!file) return showLENotification('Please select a CSV file.', 'warning');
        processCsvBtn.disabled = true;
        processCsvBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Processing...";

        const reader = new FileReader();
        reader.onload = async function (event) {
            try {
                const parsedRows = parseCSV(event.target.result);
                if (parsedRows.length < 2) throw new Error('CSV is empty or has no data.');
                const header = parsedRows.shift().map(h => h.toLowerCase().trim().replace(/"/g, ''));
                const typeIdx = header.indexOf('customer_type');
                const entryIdx = header.indexOf('entry_number');

                if (typeIdx === -1 || entryIdx === -1) {
                    throw new Error('CSV must contain "customer_type" and "entry_number" columns.');
                }

                const entries = parsedRows.map(row => ({
                    customer_type: row[typeIdx]?.trim(),
                    entry_number: row[entryIdx]?.trim()
                })).filter(e => e.customer_type && e.entry_number);
                
                if (entries.length === 0) throw new Error('No valid data rows found.');

                // Check for duplicates based on entry_number only, assuming they are globally unique.
                // If entry_number can be the same for different types, change the check.
                const { data: existing } = await supabase.from(AVAILABLE_ENTRIES_TABLE).select('entry_number');
                const existingSet = new Set(existing.map(e => e.entry_number));
                
                const newEntries = entries.filter(e => !existingSet.has(e.entry_number));
                
                if (newEntries.length > 0) {
                    const { error } = await supabase.from(AVAILABLE_ENTRIES_TABLE).insert(newEntries);
                    if (error) throw error;
                }

                csvResultsMessage.textContent = `Processed ${parsedRows.length + 1} rows. Added ${newEntries.length} new entries. Skipped ${entries.length - newEntries.length} duplicates.`;
                csvProcessingResultsDiv.style.display = 'block';
            } catch (error) {
                showLENotification(error.message, 'error');
            } finally {
                processCsvBtn.innerHTML = 'Process Data';
                // Do not re-enable the button to prevent double-uploads. User can close and reopen.
            }
        };
        reader.readAsText(file);
    }

    function updateDashboard() {
        const activeEntries = allEntriesData.filter(e => e.status === 'In Progress');
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const completedThisMonth = allEntriesData.filter(e =>
            e.status === 'Completed' && new Date(e.updated_at) >= firstDayOfMonth
        );
        const cancelledThisMonth = allEntriesData.filter(e =>
            e.status === 'Cancelled' && new Date(e.updated_at) >= firstDayOfMonth
        );

        dbTotalEntriesEl.textContent = activeEntries.length;
        dbInProgressEntriesEl.textContent = activeEntries.length;
        dbCompletedEntriesEl.textContent = completedThisMonth.length;
        dbCancelledEntriesEl.textContent = cancelledThisMonth.length;
    }

    function setupEventListeners() {
        addNewEntryBtn.addEventListener('click', () => {
            resetEntryForm();
            populateEntryForm(null);
            openLeModal(entryFormModal);
        });
        addEntryNumbersBtn.addEventListener('click', () => {
            resetCsvModal();
            openLeModal(addEntryNumbersModal);
        });

        const handleTableAction = (action, data) => {
            switch (action) {
                case 'view': populateViewModal(data); break;
                case 'edit':
                    resetEntryForm();
                    openLeModal(entryFormModal);
                    populateEntryForm(data);
                    break;
                case 'docs':
                    currentEntryIdForDocs = data.id;
                    leDocModalTitle.innerHTML = `<i class='bx bx-folder-open'></i> Entry Documents - ${data.entry_number}`;
                    renderEntryDocuments();
                    openLeModal(leDocManagementModal);
                    break;
                case 'complete':
                    showConfirmModal('Complete Entry', `Are you sure you want to mark entry <strong>${data.entry_number}</strong> as completed?`, () => completeEntry(data.id));
                    break;
                case 'delete':
                    showConfirmModal('Delete Entry', `Are you sure you want to permanently delete entry <strong>${data.entry_number}</strong>? This cannot be undone.`, () => deleteEntry(data.id, data.entry_number));
                    break;
            }
        };

        $(entriesTableElement).on('click', 'button', function () {
            const action = $(this).data('action');
            const row = $(this).closest('tr');
            if (!row.length) return;
            const data = entriesDataTable.row(row).data();
            if (data) handleTableAction(action, data);
        });

        $(historyTableElement).on('click', 'button', function () {
            const action = $(this).data('action');
            const row = $(this).closest('tr');
            if (!row.length) return;
            const data = historyDataTable.row(row).data();
            if (data) handleTableAction(action, data);
        });

        closeEntryFormModalBtn.addEventListener('click', () => closeLeModal(entryFormModal));
        cancelEntryFormBtn.addEventListener('click', () => closeLeModal(entryFormModal));
        entryForm.addEventListener('submit', (e) => { e.preventDefault(); saveEntry(); });
        closeViewEntryModalBtn.addEventListener('click', () => closeLeModal(viewEntryModal));
        closeViewEntryFooterBtn.addEventListener('click', () => closeLeModal(viewEntryModal));
        leCloseDocModalBtn.addEventListener('click', () => closeLeModal(leDocManagementModal));
        leCloseDocModalFooterBtn.addEventListener('click', () => closeLeModal(leDocManagementModal));
        leUploadDocBtn.addEventListener('click', uploadEntryDocument);
        leDocListContainer.addEventListener('click', handleDocumentAction);
        leCustomConfirmCancelBtn.addEventListener('click', () => closeLeModal(leCustomConfirmModal));
        leCustomConfirmCloseBtn.addEventListener('click', () => closeLeModal(leCustomConfirmModal));
        leCustomConfirmOkBtn.addEventListener('click', () => {
            if (typeof currentConfirmCallback === 'function') currentConfirmCallback();
            closeLeModal(leCustomConfirmModal);
        });
        
        // MODIFIED: Event listener for Customer Type now fetches entry numbers directly.
        customerTypeSelect.addEventListener('change', () => {
            const selectedType = customerTypeSelect.value;
            if (selectedType) {
                customerNameInput.disabled = false;
                fetchAvailableEntriesForType(selectedType);
            } else {
                customerNameInput.disabled = true;
                entryNumberSelect.disabled = true;
            }
        });

        // MODIFIED: Removed the event listener for the old customer select dropdown.
        // customerSelect.addEventListener('change', () => fetchAvailableEntriesForCustomer(customerSelect.value));
        
        entryNumberSelect.addEventListener('change', () => {
            if (entryNumberSelect.value) {
                entryDetailsSection.classList.add('visible');
                saveEntryBtn.disabled = false;
                if (dutiesContainer.children.length === 0) addDutyLineFromData(null);
            } else {
                entryDetailsSection.classList.remove('visible');
                saveEntryBtn.disabled = true;
            }
        });
        addDutyLineBtn.addEventListener('click', () => addDutyLineFromData(null));
        closeEntryNumbersModalBtn.addEventListener('click', () => closeLeModal(addEntryNumbersModal));
        cancelCsvUploadBtn.addEventListener('click', () => closeLeModal(addEntryNumbersModal));
        processCsvBtn.addEventListener('click', handleProcessCsv);
        csvUploadInput.addEventListener('change', () => {
            processCsvBtn.disabled = !csvUploadInput.files[0];
        });
        openHistoryModalBtn.addEventListener('click', openHistoryModal);
        closeHistoryModalBtn.addEventListener('click', () => closeLeModal(historyModal));
        closeHistoryFooterBtn.addEventListener('click', () => closeLeModal(historyModal));
        filterHistoryBtn.addEventListener('click', handleFilterHistoryEntries);

        manualEmailCancelBtn.addEventListener('click', () => {
            closeLeModal(manualEmailModal);
            notificationEntryData = null; 
        });
        manualEmailOkBtn.addEventListener('click', () => {
            const email = manualEmailInput.value;
            if (email && notificationEntryData) {
                closeLeModal(manualEmailModal);
                sendNotification(notificationEntryData, email);
                notificationEntryData = null; 
                manualEmailInput.value = ''; 
            } else {
                showLENotification('Please enter a valid email address.', 'error');
            }
        });
    }

    // SECTION 9: HISTORY FUNCTIONS
    function openHistoryModal() {
        populateHistoryFilterDropdowns();
        handleFilterHistoryEntries();
        openLeModal(historyModal);
    }

    function populateHistoryFilterDropdowns() {
        populateCustomerTypes(historyCustomerTypeSelect);
        if (historyMonthSelect.options.length <= 1) {
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            historyMonthSelect.innerHTML = '<option value="">All Months</option>';
            months.forEach((month, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = month;
                historyMonthSelect.appendChild(option);
            });
        }
        if (!historyYearsPopulated) {
            const currentYear = new Date().getFullYear();
            historyYearSelect.innerHTML = '<option value="">All Years</option>';
            for (let i = 0; i < 5; i++) {
                const year = currentYear - i;
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                historyYearSelect.appendChild(option);
            }
            historyYearSelect.value = currentYear;
            historyYearsPopulated = true;
        }
    }

    function handleFilterHistoryEntries() {
        const historicalEntries = allEntriesData.filter(e => e.status === 'Completed' || e.status === 'Cancelled');
        const type = historyCustomerTypeSelect.value;
        const name = historyCustomerNameInput.value.toLowerCase();
        const month = historyMonthSelect.value;
        const year = historyYearSelect.value;

        const filtered = historicalEntries.filter(entry => {
            const entryDate = new Date(entry.updated_at);
            let match = true;
            if (type && entry.customer_type !== type) match = false;
            if (name && !entry.customer_name.toLowerCase().includes(name)) match = false;
            if (year && entryDate.getFullYear() != year) match = false;
            if (month && entryDate.getMonth() != month) match = false;
            return match;
        });

        historyTotalResultsEl.textContent = `Results: ${filtered.length}`;
        noHistoryResultsMessageEl.style.display = filtered.length === 0 ? 'block' : 'none';
        initializeHistoryTable(filtered);
    }


    // SECTION 10: INITIALIZATION
    function initializeModule() {
        if (isModuleInitializedLE) return;
        console.log("LE Module: Initializing...");
        setupEventListeners();

        const handleAuthChange = async (event) => {
            const user = event.detail?.user;
            if (user && (!currentUserLE || currentUserLE.id !== user.id)) {
                currentUserLE = user;
                await fetchAllEntries();
            } else if (!user && currentUserLE) {
                currentUserLE = null;
                allEntriesData = [];
                if (entriesDataTable) entriesDataTable.clear().draw();
                if (historyDataTable) historyDataTable.clear().draw();
                updateDashboard();
            }
        };

        const cleanupModule = () => {
            if (entriesDataTable) { entriesDataTable.destroy(); entriesDataTable = null; }
            if (historyDataTable) { historyDataTable.destroy(); historyDataTable = null; }
            document.removeEventListener("supabaseAuthStateChange", handleAuthChange);
            document.removeEventListener("moduleWillUnload", cleanupModule);
            console.log("LE Module Unloaded");
        };

        document.addEventListener("supabaseAuthStateChange", handleAuthChange);
        document.addEventListener("moduleWillUnload", cleanupModule);

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                currentUserLE = session.user;
                fetchAllEntries();
            }
        });

        isModuleInitializedLE = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeModule);
    } else {
        initializeModule();
    }
})();

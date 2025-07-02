// js/list-of-entries.js
(() => {
    // SECTION 1: DOM Element Selection & Configuration
    if (typeof supabase === 'undefined' || !supabase) {
        console.error("Supabase client is not available in list-of-entries.js.");
        return;
    }

    // --- Config & State ---
    const ENTRIES_TABLE = 'main_entries';
    const AVAILABLE_ENTRIES_TABLE = 'available_entry_numbers';
    const BUCKET_NAME = 'entriesdocs';
    let currentUserLE = null;
    let isModuleInitializedLE = false;
    let entriesDataTable, historyDataTable;
    let currentEntryIdForDocs = null;
    let allEntriesData = []; // This will now hold ALL entries, active and historical
    let historyYearsPopulated = false;

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
    const customerSelect = document.getElementById('le-customer-select');
    const entryNumberSelect = document.getElementById('le-entry-number-select');
    const entryDetailsSection = document.getElementById('entryDetailsSection');
    const dutiesContainer = document.getElementById('le-duties-container');
    const addDutyLineBtn = document.getElementById('addDutyLineBtn');
    const invoiceInput = document.getElementById('le-invoice-input');
    const notesInput = document.getElementById('le-notes-input');
    const bondTypeError = document.getElementById('bondTypeError');
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

    // Dashboard Elements
    const dbTotalEntriesEl = document.getElementById('db-total-entries');
    const dbInProgressEntriesEl = document.getElementById('db-inprogress-entries');
    const dbCompletedEntriesEl = document.getElementById('db-completed-entries');
    const dbCancelledEntriesEl = document.getElementById('db-cancelled-entries');

    // History Modal Elements
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


    // SECTION 2: UTILITY FUNCTIONS
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

    // FIX: Updated history table definition
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

    // SECTION 4: CORE LOGIC
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
            customer_name: customerSelect.value,
            entry_number: entryNumberSelect.value,
            invoice: invoiceInput.value.trim() || null,
            duties: duties,
            bond_type: bondSelected.value,
            notes: notesInput.value.trim() || null,
            user_email: currentUserLE.email,
            user_name: currentUserLE.user_metadata?.full_name || currentUserLE.email,
            status: statusSelect.value, // Get status from the select
            updated_at: new Date().toISOString()
        };

        let error;
        if (entryId) {
            const { error: updateError } = await supabase.from(ENTRIES_TABLE).update(dataToSave).eq('id', entryId);
            error = updateError;
        } else {
            dataToSave.status = 'In Progress'; // New entries always start as In Progress
            const { error: insertError } = await supabase.from(ENTRIES_TABLE).insert(dataToSave);
            error = insertError;
            if (!error) {
                await supabase.from(AVAILABLE_ENTRIES_TABLE).update({ is_used: true }).eq('entry_number', dataToSave.entry_number);
            }
        }
        
        saveEntryBtn.disabled = false;
        saveEntryBtn.textContent = "Save Entry";

        if (error) {
            showLENotification(`Error saving entry: ${error.message}`, 'error');
            console.error('Save Entry Error:', error);
        } else {
            showLENotification(`Entry ${entryId ? 'updated' : 'created'} successfully!`, 'success');
            closeLeModal(entryFormModal);
            await fetchAllEntries(); // Refetch all data
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
        const { error } = await supabase.from(ENTRIES_TABLE).update({ status: 'Completed', updated_at: new Date().toISOString() }).eq('id', entryId);
        if (error) {
            showLENotification(`Error completing entry: ${error.message}`, 'error');
        } else {
            showLENotification('Entry marked as completed.', 'success');
            await fetchAllEntries();
        }
    }

    // SECTION 5: MODAL & FORM HANDLING
    function resetEntryForm() {
        entryForm.reset();
        entryIdInput.value = '';
        customerTypeSelect.disabled = false;
        customerSelect.innerHTML = '<option value="">Select type first...</option>';
        customerSelect.disabled = true;
        entryNumberSelect.innerHTML = '<option value="">Select customer first...</option>';
        entryNumberSelect.disabled = true;
        dutiesContainer.innerHTML = '';
        entryDetailsSection.classList.remove('visible');
        saveEntryBtn.disabled = true;
        statusGroup.style.display = 'none'; // Hide status on reset
    }

    async function populateEntryForm(entry) {
        // This function now only populates the form, it doesn't open it.
        await populateCustomerTypes();
        if (entry) {
            entryFormModalTitle.innerHTML = `<i class='bx bx-edit-alt'></i> Edit Entry - ${entry.entry_number}`;
            entryIdInput.value = entry.id;
            customerTypeSelect.value = entry.customer_type;
            customerTypeSelect.disabled = true;
            await fetchCustomersForType(entry.customer_type, entry.customer_name);
            customerSelect.disabled = true;
            await fetchAvailableEntriesForCustomer(entry.customer_name, entry.entry_number, true);
            entryNumberSelect.disabled = true;
            invoiceInput.value = entry.invoice || '';
            notesInput.value = entry.notes || '';
            document.querySelector(`input[name="bondType"][value="${entry.bond_type}"]`).checked = true;
            dutiesContainer.innerHTML = '';
            (entry.duties || []).forEach(addDutyLineFromData);
            statusSelect.value = entry.status || 'In Progress';
            statusGroup.style.display = 'block'; // Show status dropdown for editing
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
        if(entry.duties && entry.duties.length > 0) {
            dutiesHtml = entry.duties.map(d => `<li><span class="le-duty-name">${d.type}</span> <span class="le-duty-value">${d.value} ${d.unit}</span></li>`).join('');
            dutiesHtml = `<ul class="le-duties-view-container">${dutiesHtml}</ul>`;
        }
        const safeStatus = (entry.status || 'In Progress').toLowerCase().replace(/\s/g, '-');
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
    
    // SECTION 7: EVENT LISTENERS & FORM HELPERS
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

    async function fetchCustomersForType(customerType, selectedCustomer = null) {
        customerSelect.innerHTML = '<option>Loading...</option>';
        customerSelect.disabled = true;
        const { data, error } = await supabase.from(AVAILABLE_ENTRIES_TABLE).select('customer_name').eq('customer_type', customerType);
        if (error) { customerSelect.innerHTML = '<option>Error loading</option>'; return; }
        const uniqueCustomers = [...new Set(data.map(item => item.customer_name))].sort();
        customerSelect.innerHTML = '<option value="" selected disabled>Select customer...</option>';
        uniqueCustomers.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            if (selectedCustomer === name) option.selected = true;
            customerSelect.appendChild(option);
        });
        customerSelect.disabled = false;
    }

    async function fetchAvailableEntriesForCustomer(customerName, selectedEntry = null, isEditing = false) {
        entryNumberSelect.innerHTML = '<option>Loading...</option>';
        entryNumberSelect.disabled = true;
        let query = supabase.from(AVAILABLE_ENTRIES_TABLE).select('entry_number').eq('customer_name', customerName);
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

    async function handleProcessCsv() {
        const file = csvUploadInput.files[0];
        if (!file) return showLENotification('Please select a CSV file.', 'warning');
        processCsvBtn.disabled = true;
        processCsvBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Processing...";

        const reader = new FileReader();
        reader.onload = async function(event) {
            try {
                const parsedRows = parseCSV(event.target.result);
                if (parsedRows.length < 2) throw new Error('CSV is empty or has no data.');
                const header = parsedRows.shift().map(h => h.toLowerCase().trim().replace(/"/g, ''));
                const typeIdx = header.indexOf('customer_type');
                const nameIdx = header.indexOf('customer_name');
                const entryIdx = header.indexOf('entry_number');
                if (typeIdx === -1 || nameIdx === -1 || entryIdx === -1) throw new Error('CSV must contain "customer_type", "customer_name", and "entry_number" columns.');
                const entries = parsedRows.map(row => ({
                    customer_type: row[typeIdx]?.trim(),
                    customer_name: row[nameIdx]?.trim(),
                    entry_number: row[entryIdx]?.trim()
                })).filter(e => e.customer_type && e.customer_name && e.entry_number);
                if (entries.length === 0) throw new Error('No valid data rows found.');
                const { data: existing } = await supabase.from(AVAILABLE_ENTRIES_TABLE).select('customer_name, entry_number');
                const existingSet = new Set(existing.map(e => `${e.customer_name}|${e.entry_number}`));
                const newEntries = entries.filter(e => !existingSet.has(`${e.customer_name}|${e.entry_number}`));
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
                processCsvBtn.disabled = false;
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
        dbInProgressEntriesEl.textContent = activeEntries.length; // Same as total active
        dbCompletedEntriesEl.textContent = completedThisMonth.length;
        dbCancelledEntriesEl.textContent = cancelledThisMonth.length;
    }

    function setupEventListeners() {
        addNewEntryBtn.addEventListener('click', () => {
            resetEntryForm();
            populateEntryForm(null); // Pass null for new entry
            openLeModal(entryFormModal);
        });
        addEntryNumbersBtn.addEventListener('click', () => {
            resetCsvModal();
            openLeModal(addEntryNumbersModal);
        });

        const handleTableAction = (action, data) => {
             switch(action) {
                case 'view': populateViewModal(data); break;
                case 'edit':
                    resetEntryForm();
                    openLeModal(entryFormModal); // Open modal immediately
                    populateEntryForm(data); // Populate form after opening
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

        $(entriesTableElement).on('click', 'button', function() {
            const action = $(this).data('action');
            const row = $(this).closest('tr');
            if (!row.length) return;
            const data = entriesDataTable.row(row).data();
            if (data) handleTableAction(action, data);
        });

        $(historyTableElement).on('click', 'button', function() {
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
        customerTypeSelect.addEventListener('change', () => fetchCustomersForType(customerTypeSelect.value));
        customerSelect.addEventListener('change', () => fetchAvailableEntriesForCustomer(customerSelect.value));
        entryNumberSelect.addEventListener('change', () => {
            if(entryNumberSelect.value) {
                entryDetailsSection.classList.add('visible');
                saveEntryBtn.disabled = false;
                if(dutiesContainer.children.length === 0) addDutyLineFromData(null);
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

        // History Modal Listeners
        openHistoryModalBtn.addEventListener('click', openHistoryModal);
        closeHistoryModalBtn.addEventListener('click', () => closeLeModal(historyModal));
        closeHistoryFooterBtn.addEventListener('click', () => closeLeModal(historyModal));
        filterHistoryBtn.addEventListener('click', handleFilterHistoryEntries);
    }

    // History Functions
    function openHistoryModal() {
        populateHistoryFilterDropdowns();
        handleFilterHistoryEntries();
        openLeModal(historyModal);
    }

    function populateHistoryFilterDropdowns() {
        // Populate Customer Types
        populateCustomerTypes(historyCustomerTypeSelect);

        // Populate Months
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

        // Populate Years
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


    // SECTION 8: INITIALIZATION
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

// js/client-management.js
(function() {
    if (document.body.dataset.clientManagementInitialized === 'true') {
        return;
    }
    document.body.dataset.clientManagementInitialized = 'true';

    console.log("Client Management Module Initialized with new features");

    if (!window.supabase) {
        console.error("Supabase client not found.");
        return;
    }

    // --- NUEVAS CONSTANTES Y VARIABLES GLOBALES ---
    const BUCKET_NAME = 'clients-docs'; // Bucket de Supabase para los documentos de clientes
    let currentUser = null; // Para almacenar el usuario autenticado
    let currentClientIdForDocs = null; // ID del cliente para gestionar documentos
    let allClientsData = []; // Caché local de los datos de todos los clientes

    // --- Selectores de Elementos DOM (incluyendo los nuevos) ---
    const addClientBtn = document.getElementById('add-client-btn');
    const importCsvBtn = document.getElementById('import-csv-btn');

    // Modal de Añadir/Editar Cliente
    const addClientModal = document.getElementById('addClientModal');
    const addClientForm = document.getElementById('addClientForm');
    const modalTitle = document.querySelector('#addClientModal .cm-modal-header h2');
    const closeAddClientModalBtn = document.querySelector('#addClientModal .cm-close-btn');

    // Modal de Confirmación
    const confirmModal = document.getElementById('cmConfirmModal');
    const confirmTitle = document.getElementById('cmConfirmTitle');
    const confirmMessage = document.getElementById('cmConfirmMessage');
    const confirmOkBtn = document.getElementById('cmConfirmOkBtn');
    const confirmCancelBtn = document.getElementById('cmConfirmCancelBtn');
    const confirmCloseBtn = document.getElementById('cmConfirmCloseBtn');
    let confirmCallback = null;

    // NUEVO: Modal de Importación CSV
    const importCsvModal = document.getElementById('importCsvModal');
    const closeCsvModalBtn = document.querySelector('#importCsvModal .cm-close-btn');
    const csvFileInput = document.getElementById('csvFileInput');
    const processCsvBtn = document.getElementById('processCsvBtn');
    const cancelCsvUploadBtn = document.getElementById('cancelCsvUploadBtn');
    const csvProcessingResultsDiv = document.getElementById('csv-processing-results');
    const csvResultsMessage = document.getElementById('csvResultsMessage');

    // NUEVO: Modal de Gestión de Documentos
    const docManagementModal = document.getElementById('docManagementModal');
    const docModalTitle = document.getElementById('docModalTitle');
    const closeDocModalBtn = document.getElementById('closeDocModalBtn');
    const docFileInput = document.getElementById('docFileInput');
    const uploadDocBtn = document.getElementById('uploadDocBtn');
    const docListContainer = document.getElementById('docListContainer');
    const noDocsMessage = document.getElementById('noDocsMessage');
    const closeDocModalFooterBtn = document.getElementById('closeDocModalFooterBtn');


    // --- Inicialización de DataTable (con nueva columna 'Docs') ---
    const table = $('#clientsTable').DataTable({
        responsive: true,
        columns: [
            { data: 'company_name' }, { data: 'contact_name' },
            { data: 'contact_position' }, { data: 'email' },
            { data: 'phone' }, { data: 'client_type' },
            { data: 'nationality' },
            {
                data: null,
                render: function(data, type, row) {
                    return `
                        <div class="cm-actions-btn">
                            <button class="cm-edit-btn" data-id="${row.id}" title="Edit Client"><i class='bx bxs-edit'></i></button>
                            <button class="cm-delete-btn" data-id="${row.id}" data-name="${row.company_name}" title="Delete Client"><i class='bx bxs-trash'></i></button>
                        </div>
                    `;
                },
                orderable: false, className: 'dt-center'
            },
            // --- NUEVA COLUMNA Y BOTÓN DE DOCUMENTOS ---
            {
                data: null,
                render: function(data, type, row) {
                    return `<button class="btn-goldmex-secondary btn-small cm-docs-btn" data-id="${row.id}" data-name="${row.company_name}"><i class='bx bx-folder-open'></i> Docs</button>`;
                },
                orderable: false, className: 'dt-center'
            }
        ]
    });

    // --- Funciones del Dashboard y Datos ---
    function updateDashboardCards(clients) {
        const totalClients = clients.length;
        const regularClients = clients.filter(c => c.client_type === 'Clientes Regulares').length;
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const newClients = clients.filter(c => new Date(c.created_at) > oneMonthAgo).length;
        const grupoLrClients = clients.filter(c => c.client_type === 'Grupo LR').length;
        const tramitesRyClients = clients.filter(c => c.client_type === 'Tramites RY').length;

        document.getElementById('total-clients-card').textContent = totalClients;
        document.getElementById('regular-clients-card').textContent = regularClients;
        document.getElementById('new-clients-card').textContent = newClients;
        document.getElementById('grupo-lr-clients-card').textContent = grupoLrClients;
        document.getElementById('tramites-ry-clients-card').textContent = tramitesRyClients;
    }

    async function fetchClients() {
        try {
            const { data, error } = await supabase.from('clients').select('*').order('company_name', { ascending: true });
            if (error) throw error;
            allClientsData = data; // Guardar en caché local
            table.clear().rows.add(allClientsData).draw();
            updateDashboardCards(allClientsData);
        } catch (error) {
            console.error('Error fetching clients:', error.message);
            if(window.showCustomNotificationST) {
                window.showCustomNotificationST('Error fetching clients', 'error');
            }
        }
    }

    // --- Manejo de Modales (Funciones Genéricas) ---
    function openModal(modalElement) {
        if (modalElement) modalElement.style.display = 'flex';
    }

    function closeModal(modalElement) {
        if (modalElement) modalElement.style.display = 'none';
    }

    function showConfirmModal(title, message, callback) {
        confirmTitle.textContent = title;
        confirmMessage.innerHTML = message;
        confirmCallback = callback;
        openModal(confirmModal);
    }
    
    function closeConfirmModal() {
        closeModal(confirmModal);
        confirmCallback = null;
    }

    // --- Lógica para Añadir/Editar Cliente (Formulario Manual) ---
    if(addClientForm) addClientForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const clientData = {
            company_name: document.getElementById('companyName').value,
            contact_name: document.getElementById('contactName').value,
            contact_position: document.getElementById('contactPosition').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            client_type: document.getElementById('clientType').value,
            nationality: document.getElementById('nationality').value,
            address: document.getElementById('address').value,
        };

        const editingId = addClientForm.getAttribute('data-editing-id');
        let error;
        let successMessage = '';

        if (editingId) {
            ({ error } = await supabase.from('clients').update(clientData).eq('id', editingId));
            successMessage = 'Client updated successfully!';
        } else {
            // Al crear un nuevo cliente, inicializamos el campo de documentos
            clientData.documents = []; 
            ({ error } = await supabase.from('clients').insert([clientData]));
            successMessage = 'Client added successfully!';
        }

        if (error) {
            console.error('Error saving client:', error.message);
            if(window.showCustomNotificationST) window.showCustomNotificationST(`Error saving client: ${error.message}`, 'error');
        } else {
            await fetchClients();
            closeModal(addClientModal);
            if(window.showCustomNotificationST) window.showCustomNotificationST(successMessage, 'success');
        }
    });

    // --- Lógica de Botones de la Tabla (Edit, Delete, y Docs) ---
    $('#clientsTable tbody').on('click', 'button', async function () {
        const button = $(this);
        const clientId = button.data('id');

        if (button.hasClass('cm-edit-btn')) {
            const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
            if (error) {
                console.error('Error fetching client for edit:', error.message);
                if(window.showCustomNotificationST) window.showCustomNotificationST('Error fetching client data', 'error');
                return;
            }
            
            document.getElementById('companyName').value = data.company_name;
            document.getElementById('contactName').value = data.contact_name;
            document.getElementById('contactPosition').value = data.contact_position;
            document.getElementById('email').value = data.email;
            document.getElementById('phone').value = data.phone;
            document.getElementById('clientType').value = data.client_type;
            document.getElementById('nationality').value = data.nationality;
            document.getElementById('address').value = data.address;
            
            modalTitle.textContent = 'Edit Client';
            addClientForm.setAttribute('data-editing-id', clientId);
            openModal(addClientModal);

        } else if (button.hasClass('cm-delete-btn')) {
            const clientName = button.data('name');
            showConfirmModal(
                'Delete Client', 
                `Are you sure you want to permanently delete the client <strong>${clientName}</strong>? This action will also delete all associated documents and cannot be undone.`,
                async () => {
                    // Primero, borrar documentos de Storage si existen
                    const clientToDelete = allClientsData.find(c => c.id === clientId);
                    if (clientToDelete && clientToDelete.documents && clientToDelete.documents.length > 0) {
                        const filePaths = clientToDelete.documents.map(doc => doc.file_path);
                        const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove(filePaths);
                        if (storageError) {
                            console.error('Error deleting documents from storage:', storageError.message);
                            if(window.showCustomNotificationST) window.showCustomNotificationST('Could not delete associated files, but proceeding to delete client record.', 'warning');
                        }
                    }

                    // Segundo, borrar el registro del cliente
                    const { error } = await supabase.from('clients').delete().eq('id', clientId);
                    if (error) {
                        console.error('Error deleting client:', error.message);
                        if(window.showCustomNotificationST) window.showCustomNotificationST('Error deleting client', 'error');
                    } else {
                        fetchClients();
                        if(window.showCustomNotificationST) window.showCustomNotificationST('Client deleted successfully', 'success');
                    }
                }
            );
        } else if (button.hasClass('cm-docs-btn')) {
            // NUEVA LÓGICA PARA EL BOTÓN DE DOCUMENTOS
            const clientName = button.data('name');
            currentClientIdForDocs = clientId;
            docModalTitle.innerHTML = `<i class='bx bx-folder-open'></i> Documents for: ${clientName}`;
            renderClientDocuments();
            openModal(docManagementModal);
        }
    });

    // --- NUEVO: Lógica para Importación Masiva con CSV ---
    function parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const rows = lines.slice(1).map(line => {
            const values = line.split(',');
            return header.reduce((obj, nextKey, index) => {
                obj[nextKey] = values[index] ? values[index].trim() : '';
                return obj;
            }, {});
        });
        return rows;
    }

    async function handleProcessCsv() {
        const file = csvFileInput.files[0];
        if (!file) {
            if(window.showCustomNotificationST) window.showCustomNotificationST('Please select a CSV file first.', 'warning');
            return;
        }

        processCsvBtn.disabled = true;
        processCsvBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Processing...";

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csvText = event.target.result;
                const clientsFromCsv = parseCSV(csvText);

                // Obtener todos los emails existentes para evitar duplicados
                const { data: existingClients, error: fetchError } = await supabase.from('clients').select('email');
                if (fetchError) throw fetchError;
                const existingEmails = new Set(existingClients.map(c => c.email));

                const newClients = clientsFromCsv.filter(client => {
                    return client.email && !existingEmails.has(client.email);
                }).map(client => ({ // Asegurarse de que los nuevos clientes tengan el campo de documentos
                    ...client,
                    documents: []
                }));

                let message = '';
                if (newClients.length > 0) {
                    const { error: insertError } = await supabase.from('clients').insert(newClients);
                    if (insertError) throw insertError;
                    message = `Successfully added ${newClients.length} new clients.`;
                } else {
                    message = 'No new clients to add.';
                }

                const skippedCount = clientsFromCsv.length - newClients.length;
                if (skippedCount > 0) {
                    message += ` Skipped ${skippedCount} clients because they already exist.`;
                }
                
                csvResultsMessage.textContent = message;
                csvProcessingResultsDiv.style.display = 'block';
                await fetchClients(); // Recargar la tabla

            } catch (error) {
                console.error('Error processing CSV:', error);
                if(window.showCustomNotificationST) window.showCustomNotificationST(`Error processing file: ${error.message}`, 'error');
                csvResultsMessage.textContent = `Error: ${error.message}`;
                csvProcessingResultsDiv.style.display = 'block';
            } finally {
                processCsvBtn.disabled = false;
                processCsvBtn.innerHTML = "Process File";
            }
        };
        reader.readAsText(file);
    }

    // --- NUEVO: Lógica para Gestión de Documentos ---
    function getFileIconClass(fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        switch (extension) {
            case 'pdf': return 'bxs-file-pdf';
            case 'doc': case 'docx': return 'bxs-file-doc';
            case 'xls': case 'xlsx': return 'bxs-file-excel';
            case 'jpg': case 'jpeg': case 'png': return 'bxs-file-image';
            default: return 'bxs-file-blank';
        }
    }

    function renderClientDocuments() {
        const client = allClientsData.find(c => c.id === currentClientIdForDocs);
        docListContainer.innerHTML = '';
        if (client && client.documents && client.documents.length > 0) {
            noDocsMessage.style.display = 'none';
            client.documents.forEach(doc => {
                const card = document.createElement('div');
                card.className = 'cm-doc-card';
                card.innerHTML = `
                    <div class="cm-doc-card-icon"><i class='bx ${getFileIconClass(doc.file_name)}'></i></div>
                    <div class="cm-doc-card-info">
                        <span class="cm-doc-card-name">${doc.file_name}</span>
                        <span class="cm-doc-card-date">Uploaded: ${new Date(doc.uploaded_at).toLocaleDateString()}</span>
                    </div>
                    <div class="cm-doc-card-actions">
                        <button class="cm-doc-action-btn" data-action="download" data-path="${doc.file_path}" title="Download"><i class='bx bxs-download'></i></button>
                        <button class="cm-doc-action-btn" data-action="delete" data-id="${doc.id}" data-path="${doc.file_path}" title="Delete"><i class='bx bxs-trash'></i></button>
                    </div>
                `;
                docListContainer.appendChild(card);
            });
        } else {
            noDocsMessage.style.display = 'block';
        }
    }

    async function uploadClientDocument() {
        if (!currentClientIdForDocs || !docFileInput.files[0] || !currentUser) return;

        uploadDocBtn.disabled = true;
        uploadDocBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
        const file = docFileInput.files[0];
        const filePath = `${currentUser.id}/${currentClientIdForDocs}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file);

        if (uploadError) {
            if(window.showCustomNotificationST) window.showCustomNotificationST(`Upload error: ${uploadError.message}`, 'error');
            uploadDocBtn.disabled = false;
            uploadDocBtn.innerHTML = "<i class='bx bx-upload'></i> Upload";
            return;
        }

        const newDocument = {
            id: `doc_${Date.now()}`,
            file_name: file.name,
            file_path: filePath,
            uploaded_at: new Date().toISOString()
        };

        const client = allClientsData.find(c => c.id === currentClientIdForDocs);
        const updatedDocuments = [...(client.documents || []), newDocument];
        const { error: dbError } = await supabase.from('clients').update({ documents: updatedDocuments }).eq('id', currentClientIdForDocs);

        uploadDocBtn.disabled = false;
        uploadDocBtn.innerHTML = "<i class='bx bx-upload'></i> Upload";

        if (dbError) {
            if(window.showCustomNotificationST) window.showCustomNotificationST(`Failed to save document record: ${dbError.message}`, 'error');
        } else {
            if(window.showCustomNotificationST) window.showCustomNotificationST('Document uploaded successfully!', 'success');
            await fetchClients(); // Recargar datos para tener la última versión
            renderClientDocuments(); // Re-renderizar la lista de documentos
            docFileInput.value = ''; // Limpiar el input
        }
    }

    async function deleteClientDocument(docId, filePath) {
        showConfirmModal('Delete Document', 'Are you sure you want to permanently delete this document?', async () => {
            const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);
            if (storageError) {
                if(window.showCustomNotificationST) window.showCustomNotificationST(`Storage error: ${storageError.message}`, 'error');
                return;
            }

            const client = allClientsData.find(c => c.id === currentClientIdForDocs);
            const updatedDocuments = client.documents.filter(d => d.id !== docId);
            const { error: dbError } = await supabase.from('clients').update({ documents: updatedDocuments }).eq('id', client.id);

            if (dbError) {
                if(window.showCustomNotificationST) window.showCustomNotificationST(`DB update error: ${dbError.message}`, 'error');
            } else {
                if(window.showCustomNotificationST) window.showCustomNotificationST('Document deleted successfully.', 'success');
                await fetchClients();
                renderClientDocuments();
            }
        });
    }

    // --- Event Listeners Generales ---
    if(addClientBtn) addClientBtn.onclick = () => {
        addClientForm.reset();
        addClientForm.removeAttribute('data-editing-id');
        modalTitle.textContent = 'Add New Client';
        openModal(addClientModal);
    };
    if(closeAddClientModalBtn) closeAddClientModalBtn.onclick = () => closeModal(addClientModal);

    if(confirmOkBtn) confirmOkBtn.onclick = () => {
        if (typeof confirmCallback === 'function') confirmCallback();
        closeConfirmModal();
    };
    if(confirmCancelBtn) confirmCancelBtn.onclick = closeConfirmModal;
    if(confirmCloseBtn) confirmCloseBtn.onclick = closeConfirmModal;

    // Listeners para CSV
    if(importCsvBtn) importCsvBtn.onclick = () => {
        csvFileInput.value = '';
        csvProcessingResultsDiv.style.display = 'none';
        processCsvBtn.disabled = true;
        openModal(importCsvModal);
    };
    if(closeCsvModalBtn) closeCsvModalBtn.onclick = () => closeModal(importCsvModal);
    if(cancelCsvUploadBtn) cancelCsvUploadBtn.onclick = () => closeModal(importCsvModal);
    if(csvFileInput) csvFileInput.onchange = () => {
        processCsvBtn.disabled = !csvFileInput.files[0];
    };
    if(processCsvBtn) processCsvBtn.onclick = handleProcessCsv;

    // Listeners para Documentos
    if(closeDocModalBtn) closeDocModalBtn.onclick = () => closeModal(docManagementModal);
    if(closeDocModalFooterBtn) closeDocModalFooterBtn.onclick = () => closeModal(docManagementModal);
    if(uploadDocBtn) uploadDocBtn.onclick = uploadClientDocument;
    if(docListContainer) docListContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('.cm-doc-action-btn');
        if (!button) return;
        const action = button.dataset.action;
        const path = button.dataset.path;
        if (action === 'download') {
            const { data, error } = await supabase.storage.from(BUCKET_NAME).download(path);
            if (error) {
                if(window.showCustomNotificationST) window.showCustomNotificationST(`Download error: ${error.message}`, 'error');
                return;
            }
            const link = document.createElement('a');
            link.href = URL.createObjectURL(data);
            link.download = path.split('/').pop();
            link.click();
            URL.revokeObjectURL(link.href);
        } else if (action === 'delete') {
            const docId = button.dataset.id;
            deleteClientDocument(docId, path);
        }
    });

    window.addEventListener('click', (event) => { 
        if (event.target == addClientModal) closeModal(addClientModal);
        if (event.target == confirmModal) closeConfirmModal();
        if (event.target == importCsvModal) closeModal(importCsvModal);
        if (event.target == docManagementModal) closeModal(docManagementModal);
    });

    // --- Inicialización del Módulo ---
    function initializeModule() {
        const authChangeHandler = (event) => {
            const sessionUser = event.detail?.user;
            if (sessionUser) {
                currentUser = sessionUser;
                fetchClients();
            } else {
                currentUser = null;
                table.clear().draw();
            }
        };

        document.addEventListener('supabaseAuthStateChange', authChangeHandler);

        // Carga inicial de datos si ya hay un usuario
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                currentUser = session.user;
                fetchClients();
            }
        });
        
        const cleanup = () => {
            console.log("Client Management Module Unloading");
            if ($.fn.DataTable.isDataTable('#clientsTable')) {
                $('#clientsTable').DataTable().destroy();
            }
            document.removeEventListener('supabaseAuthStateChange', authChangeHandler);
            delete document.body.dataset.clientManagementInitialized;
            document.removeEventListener('moduleWillUnload', cleanup);
        };
        document.addEventListener('moduleWillUnload', cleanup);
    }

    initializeModule();

})();
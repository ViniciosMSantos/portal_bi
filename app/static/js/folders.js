function _populateParentSelect(folders, prefix) {
    // Preenche recursivamente o select de pasta pai com indentação para indicar hierarquia.
    folders.forEach(function (f) {
        var opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = prefix + f.name;
        document.getElementById("folder-input-parent").appendChild(opt);
        if (f.children && f.children.length) {
            _populateParentSelect(f.children, prefix + "  ");
        }
    });
}

function _buildParentTree(folders) {
    // Monta a hierarquia de pastas a partir da lista plana para popular o select do modal.
    var map = {}, roots = [];
    folders.forEach(function (f) { map[f.id] = Object.assign({}, f, { children: [] }); });
    folders.forEach(function (f) {
        if (f.parent_id && map[f.parent_id]) {
            map[f.parent_id].children.push(map[f.id]);
        } else {
            roots.push(map[f.id]);
        }
    });
    return roots;
}

function openFolderModal() {
    // Abre o modal de nova pasta, reseta o formulário e carrega as pastas existentes no select pai.
    document.getElementById("folder-modal-overlay").style.display = "block";
    document.getElementById("folder-modal").style.display = "flex";
    document.getElementById("folder-modal-error").textContent = "";
    document.getElementById("folder-form").reset();
    document.getElementById("folder-input-name").focus();

    var sel = document.getElementById("folder-input-parent");
    sel.innerHTML = '<option value="">Nenhuma (pasta raiz)</option>';
    fetch("/api/folders")
        .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        })
        .then(function (data) {
            if (!data.ok) return;
            _populateParentSelect(_buildParentTree(data.data.folders || []), "");
        })
        .catch(function (err) {
            console.error("openFolderModal fetch:", err.message);
        });
}

function closeFolderModal() {
    // Fecha o modal de nova pasta.
    document.getElementById("folder-modal-overlay").style.display = "none";
    document.getElementById("folder-modal").style.display = "none";
}

async function submitFolder(e) {
    // Envia o formulário de criação de pasta via POST /api/folders, fecha o modal e recarrega a sidebar.
    e.preventDefault();
    var btn = document.getElementById("folder-btn-submit");
    var errorEl = document.getElementById("folder-modal-error");
    var name = document.getElementById("folder-input-name").value.trim();
    var parent_id = document.getElementById("folder-input-parent").value;
    var description = document.getElementById("folder-input-desc").value.trim();

    btn.disabled = true;
    btn.textContent = "Criando...";
    errorEl.textContent = "";

    try {
        var res = await fetch("/api/folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, parent_id: parent_id, description: description }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erro ao criar pasta");
        closeFolderModal();
        reloadFolders();
    } catch (err) {
        errorEl.textContent = err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = "Criar pasta";
    }
}

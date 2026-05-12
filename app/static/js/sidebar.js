var _allDashboards = [];
var _allFoldersMap = {};
var _selectedFolderId = null;

function _buildTree(folders) {
    var map = {}, roots = [];
    _allFoldersMap = {};
    folders.forEach(function (f) {
        _allFoldersMap[f.id] = f;
        map[f.id] = Object.assign({}, f, { children: [] });
    });
    folders.forEach(function (f) {
        if (f.parent_id && map[f.parent_id]) {
            map[f.parent_id].children.push(map[f.id]);
        } else {
            roots.push(map[f.id]);
        }
    });
    return roots;
}

function _renderTree(nodes, depth) {
    return nodes.map(function (f) {
        var pl = 16 + depth * 16;
        var hasChildren = f.children.length > 0;
        var chevron = hasChildren
            ? '<span class="folder-chevron" data-target="fc-' + f.id + '">›</span>'
            : '<span class="folder-chevron-gap"></span>';
        var item = '<div class="folder-tree-item" style="padding-left:' + pl + 'px" data-folder-id="' + f.id + '" data-folder-name="' + f.name + '">'
            + chevron
            + '<img class="nav-icon" src="' + window._folderIcon + '" alt="" />'
            + '<span class="folder-tree-name">' + f.name + '</span>'
            + '</div>';
        if (hasChildren) {
            item += '<div class="folder-tree-children" id="fc-' + f.id + '">'
                + _renderTree(f.children, depth + 1)
                + '</div>';
        }
        return item;
    }).join('');
}

function _getBreadcrumb(folderId) {
    var crumbs = [], current = _allFoldersMap[folderId];
    while (current) {
        crumbs.unshift(current);
        current = current.parent_id ? _allFoldersMap[current.parent_id] : null;
    }
    return crumbs;
}

function _getSubFolders(folderId) {
    return Object.values(_allFoldersMap).filter(function (f) { return f.parent_id === folderId; });
}

function _escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function goHome(e) {
    var area = document.getElementById("folder-content");
    if (!area) return;
    e.preventDefault();
    _selectedFolderId = null;
    document.querySelectorAll(".folder-tree-item").forEach(function (el) {
        el.classList.remove("folder-tree-item-active");
    });
    var navHome = document.getElementById("nav-home");
    if (navHome) navHome.classList.add("nav-active");
    var navConfig = document.getElementById("nav-config");
    if (navConfig) navConfig.classList.remove("nav-active");
    area.innerHTML = '<h1 id="folder-content-title">Início</h1>'
        + '<div id="folder-content-area"></div>';
}

function goConfig(e) {
    var area = document.getElementById("folder-content");
    if (!area) return;
    e.preventDefault();
    _selectedFolderId = null;
    document.querySelectorAll(".folder-tree-item").forEach(function (el) {
        el.classList.remove("folder-tree-item-active");
    });
    var navHome = document.getElementById("nav-home");
    if (navHome) navHome.classList.remove("nav-active");
    var navConfig = document.getElementById("nav-config");
    if (navConfig) navConfig.classList.add("nav-active");
    loadConfigPanel();
}

function loadFolderContent(folderId, folderName) {
    _selectedFolderId = folderId;

    document.querySelectorAll(".folder-tree-item").forEach(function (el) {
        el.classList.toggle("folder-tree-item-active", el.dataset.folderId === folderId);
    });
    var navHome = document.getElementById("nav-home");
    if (navHome) navHome.classList.remove("nav-active");

    var crumbs = _getBreadcrumb(folderId);
    var subFolders = _getSubFolders(folderId);
    var dashes = _allDashboards.filter(function (d) { return d.folder_id === folderId; });

    var breadcrumbHtml = '<nav id="content-breadcrumb">'
        + '<a id="breadcrumb-home" href="/">Início</a>'
        + crumbs.map(function (f) {
            return '<span class="breadcrumb-sep">/</span><span class="breadcrumb-crumb">' + _escHtml(f.name) + '</span>';
        }).join('')
        + '</nav>';
    var headerHtml = '<h1 id="folder-content-title">' + _escHtml(folderName) + '</h1>'
        + '<hr id="content-separator" />'
        + breadcrumbHtml;

    var foldersHtml = '';
    if (subFolders.length) {
        foldersHtml = '<p class="content-section-label">PASTAS</p>'
            + '<div class="content-folders-grid">'
            + subFolders.map(function (f) {
                return '<div class="content-folder-card" data-folder-id="' + f.id + '" data-folder-name="' + _escHtml(f.name) + '">'
                    + '<img class="content-folder-icon" src="' + window._folderIconDark + '" alt="" />'
                    + '<span class="content-folder-name">' + _escHtml(f.name) + '</span>'
                    + '</div>';
            }).join('')
            + '</div>';
    }

    var dashesHtml = '';
    if (dashes.length) {
        dashesHtml = '<p class="content-section-label">DASHBOARDS</p>'
            + '<div class="content-dashboards-grid">'
            + dashes.map(function (d) {
                return '<div class="dash-card">'
                    + '<div class="dash-card-body">'
                    + '<div class="dash-card-top">'
                    + '<span class="dash-card-title">' + _escHtml(d.title) + '</span>'
                    + '<a class="dash-card-link" href="' + _escHtml(d.url) + '" target="_blank" title="Abrir">&#x2197;</a>'
                    + '</div>'
                    + (d.description ? '<div class="dash-card-desc">' + _escHtml(d.description) + '</div>' : '')
                    + '<div class="dash-card-footer">'
                    + '<span class="dash-card-type">' + _escHtml(d.link_type) + '</span>'
                    + '</div>'
                    + '</div>'
                    + '</div>';
            }).join('')
            + '</div>';
    }

    var empty = '';
    if (!subFolders.length && !dashes.length) {
        empty = '<div id="folder-empty-state">'
            + '<svg id="folder-empty-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">'
            + '<path d="M5 16C5 13.8 6.8 12 9 12H24L30 18H55C57.2 18 59 19.8 59 22V48C59 50.2 57.2 52 55 52H9C6.8 52 5 50.2 5 48V16Z" stroke="#D1D5DB" stroke-width="2.5" fill="none"/>'
            + '<line x1="38" y1="32" x2="46" y2="32" stroke="#D1D5DB" stroke-width="2.5" stroke-linecap="round"/>'
            + '<line x1="42" y1="28" x2="42" y2="36" stroke="#D1D5DB" stroke-width="2.5" stroke-linecap="round"/>'
            + '</svg>'
            + '<p id="folder-empty-title">Pasta vazia</p>'
            + '<p id="folder-empty-subtitle">Use o botão <strong>Adicionar</strong> para criar um dashboard ou pasta aqui.</p>'
            + '</div>';
    }

    var area = document.getElementById("folder-content");
    if (!area) return;
    area.innerHTML = headerHtml + foldersHtml + dashesHtml + empty;
}

function reloadFolders() {
    fetch("/api/folders")
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.ok) return;
            _allDashboards = data.data.dashboards || [];
            var container = document.getElementById("sidebar-folders");
            container.innerHTML = _renderTree(_buildTree(data.data.folders || []), 0);
            if (_selectedFolderId) {
                var active = container.querySelector('[data-folder-id="' + _selectedFolderId + '"]');
                if (active) active.classList.add("folder-tree-item-active");
            }
        });
}

document.addEventListener("DOMContentLoaded", function () {
    var contentEl = document.getElementById("folder-content");
    if (contentEl) {
        contentEl.addEventListener("click", function (e) {
            var card = e.target.closest(".content-folder-card");
            if (!card) return;
            var fid = card.dataset.folderId;
            var fname = card.dataset.folderName;
            loadFolderContent(fid, fname);
            var sidebarItem = document.querySelector('.folder-tree-item[data-folder-id="' + fid + '"]');
            if (sidebarItem) {
                var children = document.getElementById("fc-" + fid);
                if (children && children.style.display === "none") {
                    children.style.display = "block";
                    var chevron = sidebarItem.querySelector(".folder-chevron");
                    if (chevron) chevron.classList.add("folder-chevron-open");
                }
            }
        });
    }

    document.getElementById("sidebar-folders").addEventListener("click", function (e) {
        var item = e.target.closest(".folder-tree-item");
        if (!item) return;

        var childrenId = "fc-" + item.dataset.folderId;
        var children = document.getElementById(childrenId);
        if (children) {
            var open = children.style.display !== "none";
            children.style.display = open ? "none" : "block";
            var chevron = item.querySelector(".folder-chevron");
            if (chevron) chevron.classList.toggle("folder-chevron-open", !open);
        }

        loadFolderContent(item.dataset.folderId, item.dataset.folderName);
    });

    reloadFolders();
});

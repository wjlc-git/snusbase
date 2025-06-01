const API_BASE = 'https://api.snusbase.com';

/* Utility Functions */

const escapeHtml = str => {
    try {
        return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    } catch (err) {
        return JSON.stringify(str)
    }
};

const randomID = () => Math.random().toString(36).substr(2, 13);

const formatDateTime = ts => {
    const d = new Date(ts), n = new Date(), o = d.toDateString() === n.toDateString()
        ? { hour: 'numeric', minute: '2-digit', hour12: true }
        : { month: 'short', day: '2-digit', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
    return d.toLocaleString('en-US', o).replace(/, (\d{4})/, '$1');
};

const isValidIPAddress = (term) => {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^[0-9a-fA-F:]{2,}$/;

    return ipv4Regex.test(term) || ipv6Regex.test(term);
};

const fetchAPIData = async (url, body) => {
    try {
        const headers = { 
            Auth: document.getElementById('snusbase_code').value, 
            'Content-Type': 'application/json' 
        };

        const options = {
            method: body ? 'POST' : 'GET',
            headers,
            ...(body && { body: JSON.stringify(body) })
        };

        const response = await fetch(url, options);
        return await response.json();
    } catch (err) {
        console.error('Error fetching API data:', err);
        throw err;
    }
};


const updateElement = (el, content, color = 'var(--error)') => { el.innerHTML = content; el.style.color = color; el.onclick = null; el.className = ''; };

/* Tools */

const ipWhois = async el => {
    const elements = el ? [el] : document.querySelectorAll('.x-lastip');
    const terms = new Set();
    const termElements = [];

    elements.forEach(el => {
        if (terms.size >= 100) return;
        const originalContent = el.innerHTML;
        el.setAttribute('data-old-content', originalContent);
        el.innerHTML = 'Fetching...';
        el.className = '';
        el.onclick = null;

        originalContent.split(/[,]/).forEach(term => {
            term = term.trim();
            if (isValidIPAddress(term)) {
                terms.add(term);
                termElements.push({ term, el });
            } else {
                el.innerHTML = originalContent;
            }
        });
    });

    const url = `${API_BASE}/tools/ip-whois`;
    const response = await fetchAPIData(url, { terms: Array.from(terms) });

    termElements.forEach(({ term, el }) => {
        const result = response.results?.[term];
        if (result) {
            const location = [result.city, result.regionName, result.country].filter(Boolean).join(', ');
            const extraInfo = `${result.proxy || result.hosting ? ' <span class="x-feature warning">VPN</span>' : ''}${result.mobile ? ' <span class="x-feature warning">Mobile</span>' : ''}`;
            el.innerHTML = `${el.getAttribute('data-old-content')} <br/><span class="x-feature">${location}</span>${extraInfo}`;
        } else {
            el.innerHTML = el.getAttribute('data-old-content');
            el.style.color = 'var(--error)';
        }
    });
};

const hashCrack = async el => {
    const elements = el ? [el] : document.querySelectorAll('.x-hash');
    const terms = new Set();
    const termElements = [];

    elements.forEach(el => {
        const originalContent = el.innerHTML;
        el.setAttribute('data-old-content', originalContent);
        el.innerHTML = 'Cracking...';
        el.className = '';
        el.onclick = null;

        originalContent.split(/[: ]/).forEach(term => {
            term = term.trim();
            if (term) {
                terms.add(term);
                termElements.push({ term, el });
            }
        });
    });

    const url = `${API_BASE}/tools/hash-lookup`;
    const response = await fetchAPIData(url, {
        types: ['hash'],
        terms: Array.from(terms),
        group_by: false
    });

    termElements.forEach(({ term, el }) => {
        const result = response.results.find(res => term.includes(res.hash));
        const content = el.getAttribute('data-old-content');
        if (result && result.password) {
            el.innerHTML = `${content} <br/><span class="x-feature">${result.password}</span>`;
        } else {
            el.innerHTML = content;
            el.style.color = 'var(--error)';
        }
    });
};

const viewMore = async (query, tables, el = false) => {
    const vmDivs = el ? [el] : document.querySelectorAll('.vm');
    query.tables = tables.filter(table =>
        Array.from(vmDivs).map(div => div.dataset.db).includes(table)
    );

    vmDivs.forEach(div => { updateElement(div, 'Loading...', ''); div.className = 'vm'; });

    const data = await fetchAPIData(`${API_BASE}/data/search`, query);
    vmDivs.forEach(div => {
        const breachKey = div.dataset.db.split('_')[0];
        const breaches = data.results[div.dataset.db];
        const html = breaches.map((leak, index) => {
            const leakInfo = Object.entries(leak).filter(([key]) => key !== '_domain').map(([key, value]) => `<div><span>${key}</span><span${['lastip', 'hash'].includes(key) ? ` class="x-${key}"` : ''}>${escapeHtml(value)}</span></div>`).join('');
            return `<div>${breaches.length > 1 ? `<div class="rf">${index + 1}/${breaches.length}</div>` : ''}${leakInfo}</div>`;
        }).join('');
        const doc = document.getElementById(`d${breachKey}`);
        doc.innerHTML = html;
        const elements = doc.querySelectorAll('.x-lastip, .x-hash');
        if (el) {
            elements.forEach(el => (el.classList.contains('x-lastip') ? ipWhois(el) : hashCrack(el)));
        } else {
            elements.forEach(el => (el.onclick = () => el.classList.contains('x-lastip') ? ipWhois(el) : hashCrack(el)));
        }
        div.remove();
    });
};

const ipWhoisModal = async (rawTerms) => {
    const ipWhoisDiv = document.getElementById('ipwhois-div');
    try {
        const terms = [...new Set(rawTerms.filter(isValidIPAddress))];

        if (terms.length === 0) {
            ipWhoisDiv?.remove();
            return;
        }

        const url = `${API_BASE}/tools/ip-whois`;
        const response = await fetchAPIData(url, { terms });

        if (!response.results || Object.keys(response.results).length === 0) {
            ipWhoisDiv?.remove();
            return;
        }

        const resultsHtml = Object.entries(response.results).map(([ipAddress, data], index) => {
            const dataHtml = Object.entries(data).map(([key, value]) => `<div><span>${key}</span><span>${value}</span></div>`).join('');
            return `<div class="result">
                <input type="checkbox" data-type="ip-whois" class="result-toggle" id="ip${index}" checked>
                <label class="result-header" for="ip${index}">
                    <div>${ipAddress.toUpperCase()}</div>
                    <div class="x-st">(click to show)</div>
                </label>
                <div class="result-data ipwhois" id="ip${index}">
                    <div>${dataHtml}</div>
                </div>
            </div>`;
        }).join('');

        ipWhoisDiv.innerHTML = `<div class="result-group"><div class="header"><div>IP Whois Data</div><div><a onclick="collapseAll('ip-whois')">-</a> <a onclick="expandAll('ip-whois')">+</a></div></div><div class="results">${resultsHtml}</div></div>`;
    } catch (error) {
        console.error('Error in ipWhoisModal:', error);
        ipWhoisDiv?.remove();
    }
};

/* User Interface Functions */

const enableSubHeader = () => {
    if (document.querySelector('.vm') || document.querySelector('.x-hash') || document.querySelector('.x-lastip')) {
        document.getElementById('sub-header').style.display = 'flex';
    }
};

const toggleAll = (expand, type) => {
    document.querySelectorAll('.result-toggle').forEach(box => {
        if(box.dataset.type === type) box.checked = !expand
    });
};

const expandAll = (type = "leak") => toggleAll(true, type);
const collapseAll = (type = "leak") => toggleAll(false, type);

/* LocalStorage Database Functions */

const getTerms = (field, value) => JSON.parse(localStorage.getItem('savedTerms') || '[]').find(obj => obj[field] === value);

const saveTerms = (query, size) => {
    const doc = {
        id: randomID(),
        options: query.options,
        terms: query.terms,
        types: query.types,
        size,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    const savedTerms = JSON.parse(localStorage.getItem('savedTerms') || '[]');
    const termIndex = savedTerms.findIndex(term =>
        JSON.stringify(term.terms) === JSON.stringify(doc.terms) &&
        JSON.stringify(term.types.sort()) === JSON.stringify(doc.types.sort())
    );

    if (termIndex !== -1) {
        doc.createdAt = savedTerms[termIndex].createdAt;
        savedTerms[termIndex] = doc;
    } else {
        savedTerms.push(doc);
    }

    localStorage.setItem('savedTerms', JSON.stringify(savedTerms));
};

const deleteTerms = (field, value) => {
    const savedTerms = JSON.parse(localStorage.getItem('savedTerms') || '[]');
    localStorage.setItem('savedTerms', JSON.stringify(savedTerms.filter(term => term[field] !== value)));
    const element = document.getElementById(value);
    if (field === 'id' && element) element.remove();
};

const deleteMultipleTerms = params => params.forEach(param => deleteTerms(param.field, param.value));

const deleteSelected = array => {
    deleteMultipleTerms(array.map(value => ({ field: 'id', value })));
    if (selected && document.getElementById('x-options')) {
        selected.length = 0;
        document.getElementById('x-options').style.display = 'none';
    }
};

const mergeTerms = ids => {
    const doc = {
        id: randomID(),
        options: [],
        terms: [],
        types: [],
        size: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    ids.forEach(id => {
        const savedTerm = getTerms('id', id);
        if (savedTerm) {
            savedTerm.terms.forEach(term => {
                if (!doc.terms.includes(term)) doc.terms.push(term);
            });
            savedTerm.types.forEach(type => {
                if (!doc.types.includes(type)) doc.types.push(type);
            });
            savedTerm.options.forEach(option => {
                if (!doc.options.includes(option)) doc.options.push(option);
            });
        }
    });

    if (doc.terms.length > 25) {
        alert('Error: Unable to merge selected terms, you cannot have more than 25 terms per query.');
        return false;
    }

    saveTerms(doc, undefined);
    deleteMultipleTerms(ids.map(value => ({ field: 'id', value })));

    return doc;
};

const mergeSelected = selected => {
    const merged = mergeTerms(selected);
    if (merged) {
        if (selected && document.getElementById('x-options')) {
            selected.length = 0;
            document.getElementById('x-options').style.display = 'none';
        }
        loadHistory('historyData');
    }
};

/* History Functions */

const searchFavorite = termID => {
    const query = getTerms('id', termID);
    let form = document.createElement("form");
    document.body.appendChild(form);
    form.method = "POST";
    form.action = "/";

    const types = query.types.reduce((acc, cur) => ({ ...acc, [cur]: "on" }), {});
    const options = query.options.reduce((acc, cur) => ({ ...acc, [cur]: "on" }), {});
    let doc = { terms: query.terms.join(','), ...types, ...options };

    Object.keys(doc).forEach(key => {
        let input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = doc[key];
        form.appendChild(input);
    });

    form.submit();
};

const interactiveHistory = () => {
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', event => {
            if (event.target.checked) {
                selected.push(event.target.value);
            } else {
                const index = selected.indexOf(event.target.value);
                if (index > -1) {
                    selected.splice(index, 1);
                }
            }

            if (selected.length >= 1) {
                document.getElementById('x-selected').innerHTML = `${selected.length} selected.`;
                document.getElementById('x-options').style = 'display: flex;';
            } else {
                document.getElementById('x-options').style = 'display: none;';
            }
        });
    });
};

const loadHistory = where => {
    const savedTermsString = localStorage.getItem('savedTerms');
    const savedTerms = JSON.parse(savedTermsString);
    if (!savedTermsString || !savedTerms || !savedTerms.length) {
        const html = `<div class="tr th"><div class="item-select"></div><div class="time-info">Date</div><div class="item-info">Types & Terms</div><div class="results">Size</div><div class="actions">Actions</div></div>
        <div class="no-saved-searches"><h2>You currently have no saved searches..</h2><p>Check the “save search” checkbox on the search page, or select the "enable search history” checkbox on the settings page to start populating this table.</p></div>`;
        document.getElementById(where).innerHTML = html.replace(/\s\s+/g, ' ');
        return;
    }

    savedTerms.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const html = [
        '<div class="tr th"><div class="item-select"></div><div class="time-info">Date</div><div class="item-info">Types & Terms</div><div class="results">Size</div><div class="actions">Actions</div></div>',
        ...savedTerms.map(saved => `
            <div class="tr" id="${saved.id}">
                <div class="item-select"><input type="checkbox" value="${saved.id}"></div>
                <div class="time-info">${formatDateTime(saved.updatedAt)}</div>
                <div class="item-info">
                    <div class="types">${saved.types.join(', ')}</div>
                    <div>${saved.terms.map(item => `${item}`).join(', ')}</div>
                </div>
                <div class="results">${(saved.size || saved.size === 0) ? saved.size : 'N/A'}</div>
                <div class="actions">
                    <a onclick="searchFavorite('${saved.id}')"><svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg></a>
                    <a onclick="deleteTerms('id', '${saved.id}')"><svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg></a>
                </div>
            </div>
        `).join('')
    ].join('');

    document.getElementById(where).innerHTML = html.replace(/\s\s+/g, ' ');
    interactiveHistory();
};

/* Temporary Migration Code */

const tempCombolists = async (terms) => {
    try {
        const results = {};
        let totalResultsCount = 0;

        await Promise.all(terms.map(async (term) => {
            const response = await fetchAPIData(`${API_BASE}/temp/combolists/${encodeURIComponent(term)}`);
            for (const [table, data] of Object.entries(response.result || {})) {
                results[table] = [...(results[table] || []), ...data];
                totalResultsCount += data.length;
            }
        }));

        if (Object.keys(results).length === 0) {
            document.getElementById('combo-div')?.remove();
            return;
        }

        const resultsHtml = Object.entries(results).map(([combolistName, combolist], index) => {
            const toggleId = `c${index + 1}`;
            const resultCount = combolist.length;
            const combolistHtml = combolist.map(({ username, password }) => `<div>${escapeHtml(username)}:${escapeHtml(password)}</div>`).join('');

            return `<div class="result">
                <input type="checkbox" data-type="combolist" class="result-toggle" id="${toggleId}" checked>
                <label class="result-header" for="${toggleId}">
                    <div>${combolistName.toUpperCase()}</div>
                    <div class="x-st">(<span></span> ${resultCount} result${resultCount !== 1 ? 's' : ''})</div>
                </label>
                <div class="result-data combolist" id="${toggleId}">
                    ${combolistHtml}
                </div>
            </div>`;
        }).join('');

        const html = `<div class="result-group"><div class="header"><div>Combolists</div><div><a onclick="collapseAll('combolist')">-</a> <a onclick="expandAll('combolist')">+</a></div></div><div class="results">${resultsHtml}</div></div>`;

        document.getElementById('combo-div').innerHTML = html;

        const resultCountDiv = document.getElementById('result-count');
        resultCountDiv.innerHTML = (Number(resultCountDiv.innerHTML.replace(/,/g, '')) + totalResultsCount).toLocaleString();


        return results;
    } catch (error) {
        console.error('Error fetching combolists:', error);
        document.getElementById('combo-div')?.remove();
    }
}

if (localStorage.getItem('saved') && !localStorage.getItem('savedTerms')) {
    const oldSavedTerms = JSON.parse(localStorage.getItem('saved'));
    const newSavedTerms = oldSavedTerms.map(element => ({
        id: randomID(),
        options: element.wildcard ? ['wildcard'] : [],
        terms: [element.term],
        types: [element.type],
        size: element.results,
        createdAt: element.saved ? element.saved * 1000 : Date.now(),
        updatedAt: element.saved ? element.saved * 1000 : Date.now()
    }));
    localStorage.setItem('savedTerms', JSON.stringify(newSavedTerms));
}

if (localStorage.getItem('saved') && localStorage.getItem('savedTerms')) {
    const migratedAt = localStorage.getItem('migrated_at');
    const deleteAfter = 14 * 24 * 60 * 60 * 1000; // 14 days

    if (!migratedAt) {
        localStorage.setItem('migrated_at', Date.now());
    } else if (Date.now() - parseInt(migratedAt, 10) >= deleteAfter) {
        localStorage.removeItem('migrated_at');
        localStorage.removeItem('saved');

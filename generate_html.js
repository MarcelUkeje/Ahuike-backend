const fs = require('fs');

const data = fs.readFileSync('specialties_and_departments.txt', 'utf8').split('\n');

const specialties = [];
const departments = [];

let mode = 0; // 1 = spec, 2 = dep
for (const line of data) {
    const t = line.trim();
    if (!t) continue;
    if (t.includes('Doctor Specialties')) {
        mode = 1; continue;
    }
    if (t.includes('Hospital Departments')) {
        mode = 2; continue;
    }

    if (mode === 1) specialties.push(t);
    else if (mode === 2) departments.push(t);
}

const qualifications = [
  'MBBS', 'MD', 'FMCP', 'FMCGP', 'FWACP', 'FRCS', 'PhD', 'Fellowship'
];

let html = fs.readFileSync('public/admin/index.html', 'utf8');

// Color replace
html = html.replace(/#0d6efd/g, '#0F766E');
html = html.replace(/#0b5ed7/g, '#0F766E');

// Specialty select replace
const specSelect = `
          <select id="doc-specialty" required>
            <option value="">Select Specialty...</option>
${specialties.map(s => `            <option value="${s}">${s}</option>`).join('\n')}
          </select>
`;
html = html.replace(/<input type="text" id="doc-specialty"[^>]*>/, specSelect.trim());

// Dept select replace
const deptSelect = `
          <select id="doc-dept" required>
            <option value="">Select Department...</option>
${departments.map(d => {
    // humanize the dept string. e.g. dept-general-surgery -> General Surgery
    const human = d.replace('dept-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return `            <option value="${d}">${human}</option>`;
}).join('\n')}
          </select>
`;
html = html.replace(/<input type="text" id="doc-dept"[^>]*>/, deptSelect.trim());

// Qual select replace
const qualSelect = `
        <select id="doc-qualifications" multiple size="4" required>
${qualifications.map(q => `          <option value="${q}">${q}</option>`).join('\n')}
        </select>
        <small style="display:block; margin-top:5px; color:#666;">Hold Ctrl/Cmd to select multiple</small>
`;
html = html.replace(/<input type="text" id="doc-qualifications"[^>]*>/, qualSelect.trim());


// update script to get multiple values
html = html.replace(/document\.getElementById\('doc-qualifications'\)\.value\.split\('.'\)\.map\(q => q\.trim\(\)\)/g, 
  "Array.from(document.getElementById('doc-qualifications').selectedOptions).map(o => o.value)");

fs.writeFileSync('public/admin/index.html', html);
console.log('done html');

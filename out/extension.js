"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const API_BASE = 'https://api.proofx.co.uk';
const VERIFY_BASE = 'https://proofx.co.uk/verify';
function getConfig() {
    const config = vscode.workspace.getConfiguration('proofx');
    return {
        apiKey: config.get('apiKey') || '',
        creatorId: config.get('creatorId') || '',
        autoSign: config.get('autoSign') || false,
    };
}
function sha256File(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}
function apiRequest(endpoint, body, apiKey) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const url = new URL(endpoint, API_BASE);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
            },
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                }
                catch {
                    reject(new Error(`Invalid response: ${body}`));
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}
async function signFile(uri) {
    const { apiKey, creatorId } = getConfig();
    if (!apiKey || !creatorId) {
        const setup = await vscode.window.showErrorMessage('ProofX: API Key and Creator ID required. Get them free at proofx.co.uk/developer', 'Set API Key', 'Set Creator ID');
        if (setup === 'Set API Key') {
            vscode.commands.executeCommand('proofx.setApiKey');
        }
        else if (setup === 'Set Creator ID') {
            vscode.commands.executeCommand('proofx.setCreatorId');
        }
        return;
    }
    const filePath = uri?.fsPath || vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!filePath) {
        vscode.window.showErrorMessage('ProofX: No file selected');
        return;
    }
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBar.text = '$(shield) ProofX: Signing...';
    statusBar.show();
    try {
        const hash = sha256File(filePath);
        const fileName = path.basename(filePath);
        const result = await apiRequest('/api/sign-hash', {
            hash,
            creator_id: creatorId,
            filename: fileName,
        }, apiKey);
        if (result.content_id) {
            const verifyUrl = `${VERIFY_BASE}?id=${result.content_id}`;
            // Save proof metadata
            const proofDir = path.join(path.dirname(filePath), '.proofx');
            if (!fs.existsSync(proofDir)) {
                fs.mkdirSync(proofDir, { recursive: true });
            }
            const proofFile = path.join(proofDir, `${fileName}.proof.json`);
            fs.writeFileSync(proofFile, JSON.stringify({
                file: fileName,
                hash,
                content_id: result.content_id,
                signature: result.signature,
                verification_url: verifyUrl,
                signed_at: new Date().toISOString(),
                creator_id: creatorId,
            }, null, 2));
            statusBar.text = `$(verified) ProofX: Signed`;
            statusBar.tooltip = `${fileName} signed. ID: ${result.content_id}`;
            const action = await vscode.window.showInformationMessage(`ProofX: ${fileName} signed successfully!`, 'Copy Verification URL', 'Open in Browser');
            if (action === 'Copy Verification URL') {
                vscode.env.clipboard.writeText(verifyUrl);
                vscode.window.showInformationMessage('Verification URL copied!');
            }
            else if (action === 'Open in Browser') {
                vscode.env.openExternal(vscode.Uri.parse(verifyUrl));
            }
        }
        else {
            throw new Error(JSON.stringify(result));
        }
    }
    catch (err) {
        vscode.window.showErrorMessage(`ProofX: Sign failed - ${err.message}`);
        statusBar.text = '$(error) ProofX: Failed';
    }
    setTimeout(() => statusBar.dispose(), 5000);
}
async function verifyFile(uri) {
    const filePath = uri?.fsPath || vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!filePath) {
        vscode.window.showErrorMessage('ProofX: No file selected');
        return;
    }
    const fileName = path.basename(filePath);
    const proofFile = path.join(path.dirname(filePath), '.proofx', `${fileName}.proof.json`);
    if (!fs.existsSync(proofFile)) {
        vscode.window.showWarningMessage(`ProofX: No signature found for ${fileName}. Sign it first.`);
        return;
    }
    const proof = JSON.parse(fs.readFileSync(proofFile, 'utf-8'));
    const currentHash = sha256File(filePath);
    if (currentHash === proof.hash) {
        const action = await vscode.window.showInformationMessage(`ProofX: ${fileName} is VERIFIED. Untampered since ${proof.signed_at}`, 'Open Verification Page');
        if (action === 'Open Verification Page') {
            vscode.env.openExternal(vscode.Uri.parse(proof.verification_url));
        }
    }
    else {
        vscode.window.showWarningMessage(`ProofX: ${fileName} has been MODIFIED since signing!\n` +
            `Original hash: ${proof.hash.substring(0, 16)}...\n` +
            `Current hash: ${currentHash.substring(0, 16)}...`);
    }
}
async function signFolder(uri) {
    const { apiKey, creatorId } = getConfig();
    if (!apiKey || !creatorId) {
        vscode.window.showErrorMessage('ProofX: Set API Key and Creator ID first (Cmd+Shift+P -> ProofX: Set API Key)');
        return;
    }
    const folderPath = uri.fsPath;
    const files = getAllFiles(folderPath).filter(f => !f.includes('.proofx') && !f.includes('node_modules') && !f.includes('.git'));
    if (files.length === 0) {
        vscode.window.showInformationMessage('ProofX: No files found in folder');
        return;
    }
    const confirm = await vscode.window.showInformationMessage(`ProofX: Sign ${files.length} files in ${path.basename(folderPath)}?`, 'Sign All', 'Cancel');
    if (confirm !== 'Sign All') {
        return;
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'ProofX: Signing files',
        cancellable: false,
    }, async (progress) => {
        let signed = 0;
        for (const file of files) {
            progress.report({ message: `${signed}/${files.length} - ${path.basename(file)}`, increment: 100 / files.length });
            try {
                const hash = sha256File(file);
                const fileName = path.basename(file);
                const result = await apiRequest('/api/sign-hash', { hash, creator_id: creatorId, filename: fileName }, apiKey);
                if (result.content_id) {
                    const proofDir = path.join(path.dirname(file), '.proofx');
                    if (!fs.existsSync(proofDir)) {
                        fs.mkdirSync(proofDir, { recursive: true });
                    }
                    fs.writeFileSync(path.join(proofDir, `${fileName}.proof.json`), JSON.stringify({
                        file: fileName, hash, content_id: result.content_id,
                        signature: result.signature,
                        verification_url: `${VERIFY_BASE}?id=${result.content_id}`,
                        signed_at: new Date().toISOString(), creator_id: creatorId,
                    }, null, 2));
                    signed++;
                }
            }
            catch { /* skip failed files */ }
        }
        vscode.window.showInformationMessage(`ProofX: ${signed}/${files.length} files signed!`);
    });
}
function getAllFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                results.push(...getAllFiles(fullPath));
            }
        }
        else {
            results.push(fullPath);
        }
    }
    return results;
}
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('proofx.signFile', signFile), vscode.commands.registerCommand('proofx.verifyFile', verifyFile), vscode.commands.registerCommand('proofx.signFolder', signFolder), vscode.commands.registerCommand('proofx.setApiKey', async () => {
        const key = await vscode.window.showInputBox({
            prompt: 'Enter your ProofX API Key (get one free at proofx.co.uk/developer)',
            password: true,
            placeHolder: 'pk_live_...',
        });
        if (key) {
            await vscode.workspace.getConfiguration('proofx').update('apiKey', key, true);
            vscode.window.showInformationMessage('ProofX: API Key saved!');
        }
    }), vscode.commands.registerCommand('proofx.setCreatorId', async () => {
        const id = await vscode.window.showInputBox({
            prompt: 'Enter your ProofX Creator ID',
            placeHolder: 'c1c15c6c',
        });
        if (id) {
            await vscode.workspace.getConfiguration('proofx').update('creatorId', id, true);
            vscode.window.showInformationMessage('ProofX: Creator ID saved!');
        }
    }));
    // Auto-sign on save
    if (getConfig().autoSign) {
        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
            if (getConfig().apiKey && getConfig().creatorId) {
                signFile(doc.uri);
            }
        }));
    }
    // Status bar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(shield) ProofX';
    statusBar.tooltip = 'ProofX Content Protection';
    statusBar.command = 'proofx.signFile';
    statusBar.show();
    context.subscriptions.push(statusBar);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
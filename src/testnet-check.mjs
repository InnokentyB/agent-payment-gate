const url = 'https://horizon-testnet.stellar.org/';
const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Horizon returned ${response.status}`);
const info = await response.json();
if (info.network_passphrase !== 'Test SDF Network ; September 2015') throw new Error('Unexpected network');
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), url, networkPassphrase: info.network_passphrase, latestLedger: info.history_latest_ledger, horizonVersion: info.horizon_version, mode: 'read_only', fundedAccounts: false, paymentsSubmitted: false }));

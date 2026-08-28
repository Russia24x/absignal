import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
const BASE = 'http://localhost:3000'
const account = privateKeyToAccount(generatePrivateKey())
const address = account.address.toLowerCase()
const nonceRes = await fetch(`${BASE}/api/auth/nonce`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) })
const { message } = await nonceRes.json() as { message: string }
const signature = await account.signMessage({ message })
const verifyRes = await fetch(`${BASE}/api/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, signature }) })
const setCookie = verifyRes.headers.get('set-cookie') ?? ''
const cookieValue = /pengu_session=([^;]+)/.exec(setCookie)?.[1] ?? ''
console.log('SESSION_COOKIE=' + cookieValue)

import { HttpAgent } from "@dfinity/agent";
import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";
import { IcrcIndexCanister, IcrcLedgerCanister } from "@dfinity/ledger-icrc";
import { Principal } from "@dfinity/principal";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

const LEDGER_CANISTER_ID = "ulmlj-vaaaa-aaaak-qtpza-cai";
const INDEX_CANISTER_ID = "ucpav-diaaa-aaaak-qtpyq-cai";
const LOCAL_HOST = "https://ic0.app";
// const LOCAL_HOST = "http://127.0.0.1:4943";
const PEM_FILE_PATH = "./wallet_identity.pem";

async function saveIdentityToPem(
	identity: Secp256k1KeyIdentity,
): Promise<void> {
	const privateKey = Buffer.from(identity.getKeyPair().secretKey).toString(
		"hex",
	);
	const pemContent = `-----BEGIN EC PRIVATE KEY-----\n${privateKey}\n-----END EC PRIVATE KEY-----`;
	await writeFile(PEM_FILE_PATH, pemContent);
}

async function loadOrCreateIdentity(): Promise<Secp256k1KeyIdentity> {
	try {
		if (existsSync(PEM_FILE_PATH)) {
			const pemContent = await readFile(PEM_FILE_PATH, "utf-8");
			const privateKey = pemContent
				.replace("-----BEGIN EC PRIVATE KEY-----", "")
				.replace("-----END EC PRIVATE KEY-----", "")
				.trim();

			const secretKey = Buffer.from(privateKey, "hex");
			return Secp256k1KeyIdentity.fromSecretKey(secretKey);
		}
	} catch (error) {
		console.log("Creating new identity...");
	}

	const newIdentity = Secp256k1KeyIdentity.generate();
	await saveIdentityToPem(newIdentity);
	return newIdentity;
}

// New function to monitor transactions
async function monitorTransactions(
	index: IcrcIndexCanister,
	maxResults: number,
	principal: Principal,
	callback: (txs: any) => void,
) {
	let lastTxCount = 0;

	// Check for new transactions every 5 seconds
	setInterval(async () => {
		try {
			const txs = await index.getTransactions({
				max_results: BigInt(maxResults),
				account: {
					owner: principal,
				},
			});

			if (txs.transactions.length > lastTxCount) {
				lastTxCount = txs.transactions.length;
				callback(txs);
			}
		} catch (error) {
			console.error("Error monitoring transactions:", error);
		}
	}, 5000);
}

async function main() {
	try {
		const identity = await loadOrCreateIdentity();
		console.log("Principal ID:", identity.getPrincipal().toString());

		const agent = await HttpAgent.create({
			identity: identity,
			host: LOCAL_HOST,
		});
		await agent.fetchRootKey();

		const ledger = IcrcLedgerCanister.create({
			agent,
			canisterId: Principal.from(LEDGER_CANISTER_ID),
		});

		const index = IcrcIndexCanister.create({
			agent,
			canisterId: Principal.fromText(INDEX_CANISTER_ID),
		});

		// Start monitoring transactions
		monitorTransactions(index, 1, identity.getPrincipal(), (txs) => {
			console.log("New transactions detected:", txs);
		});

		// Rest of your code remains the same
		const balance = await ledger.balance({
			owner: identity.getPrincipal(),
		});
		console.log("Current Balance:", balance.toString());

		// Example transfer
		const recipientPrincipal =
			"rwd6d-yyjkg-75uj5-owi47-2guae-e6f3u-dja4x-viosl-cb63s-jcvco-jae"; // Replace with actual recipient
		const amountToTransfer = BigInt(100_000_000); // 1 token (with 8 decimals)

		console.log(
			`\nAttempting to transfer ${amountToTransfer} tokens to ${recipientPrincipal}`,
		);

		const transferResult = await ledger.transfer({
			to: { owner: Principal.fromText(recipientPrincipal), subaccount: [] },
			amount: amountToTransfer,
			fee: BigInt(10),
		});

		console.log("Transfer Result:", transferResult);

		// Check new balance
		const newBalance = await ledger.balance({
			owner: identity.getPrincipal(),
		});
		console.log("New Balance:", newBalance.toString());
	} catch (error) {
		console.error("Error:", error);
	}
}

// Start the application but keep it running
main().catch(console.error);

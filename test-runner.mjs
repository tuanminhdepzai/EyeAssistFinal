// test-runner.mjs
const url = 'https://tht-d3.vercel.app/api/chat';
const token = 'Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6IjYzMTg5NWIxLWU3Y2MtNDczNS1hY2JkLTUwMmM2NGNjNWI1YiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL25qbnJvbW13dWN3aGVqbHN1eWhiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI3YmY2MjNhZC1iN2UzLTRiM2YtODI4OS04ZmRhZmIyMjQ0YmIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg3OTA4NzIwLCJpYXQiOjE3ODc5MDUxMjAsImVtYWlsIjoidGVzdGVyQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZGlzcGxheV9uYW1lIjoidGVzdGVyIiwiZW1haWwiOiJ0ZXN0ZXJAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiN2JmNjIzYWQtYjdlMy00YjNmLTgyODktOGZkYWZiMjI0NGJiIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3ODc5MDUxMjB9XSwic2Vzc2lvbl9pZCI6IjM0OGQ5ZDFkLTllYWEtNDhjYy1hN2MyLTNiNmQzMDIxMWE1YiIsImlzX2Fub255bW91cyI6ZmFsc2V9._gzi1UXOJX5j_bBalpi-bLHqYHAghMVEpD1hVg69anyEEcJMP9woSAj6GsolGzb09K0EcEtAMQSjX5imj4xwsw';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const totalRequests = 100;

  for (let i = 1; i <= totalRequests; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
        },
        body: JSON.stringify({ message: 'test' }),
      });

      console.log(`[${i}/${totalRequests}] Status: ${res.status}`);
    } catch (err) {
      console.error(`[${i}/${totalRequests}] Error:`, err.message);
    }

    // Nghỉ 1 giây giữa các request
    await delay(1000);
  }
}

run();

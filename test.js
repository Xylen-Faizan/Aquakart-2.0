const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': key,
  },
  body: JSON.stringify({ email: 'customer1@aquakart.demo', password: 'password123' })
}).then(res => res.json()).then(data => console.log(data)).catch(err => console.error(err));

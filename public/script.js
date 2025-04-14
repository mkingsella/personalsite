document.getElementById('subscribe-form').addEventListener('submit', async (event) => {
    event.preventDefault();
  
    const emailInput = document.getElementById('email');
    const email = emailInput.value;
    const confirmation = document.getElementById('confirmation');
  
    try {
      const response = await fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
  
      const data = await response.json();
  
      if (response.ok) {
        confirmation.style.display = 'block';
        confirmation.style.color = 'green';
        confirmation.textContent = '🎉 Thanks for subscribing! Check your inbox shortly.';
        emailInput.value = '';
      } else {
        throw new Error(data.error || 'Submission failed.');
      }
    } catch (error) {
      confirmation.style.display = 'block';
      confirmation.style.color = 'red';
      confirmation.textContent = '❌ ' + error.message;
    }
  });
  
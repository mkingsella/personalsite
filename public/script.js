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
      confirmation.style.color = 'green';
      confirmation.textContent = '🎉 Welcome to Homefront! Check your inbox shortly.';
      emailInput.value = '';
    } else {
      confirmation.style.color = 'red';
      confirmation.textContent = '❌ ' + data.error;
    }
  } catch (error) {
    confirmation.style.color = 'red';
    confirmation.textContent = '❌ Submission failed. Please try again.';
  }

  confirmation.style.display = 'block';
});
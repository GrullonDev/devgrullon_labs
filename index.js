const WHATSAPP_NUMBER = "50242929548";

const contactForm = document.getElementById("contact-form");

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = contactForm.name.value.trim();
    const email = contactForm.email.value.trim();
    const message = contactForm.message.value.trim();

    const text =
      `Hola Jorge, mi nombre es ${name}.\n` +
      `Correo: ${email}\n` +
      `Mensaje: ${message}`;

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
  });
}

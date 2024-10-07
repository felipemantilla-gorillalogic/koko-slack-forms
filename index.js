require("dotenv").config();
const { App } = require("@slack/bolt");
const { v4: uuidv4 } = require("uuid");
const { Anthropic } = require("@anthropic-ai/sdk");

// Enviar los datos a la URL de envío
const axios = require("axios");

// Inicializa la app de Slack
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Almacenamiento temporal para los formularios
const forms = {};

// Objeto temporal para el formulario en creación
let tempForm = null;

// Comando para crear un formulario interactivo
app.command("/create-form", async ({ command, ack, say, body }) => {
  await ack();

  // Inicializar un nuevo formulario temporal
  const formId = uuidv4();
  tempForm = {
    id: formId,
    userId: body.user_id,
    title: "",
    description: "",
    fields: [],
    submissionUrl: "", // Nuevo campo para la URL de envío
  };

  await say({
    blocks: [
      {
        type: "input",
        block_id: "form_title_input",
        element: {
          type: "plain_text_input",
          action_id: "form_title",
          placeholder: {
            type: "plain_text",
            text: "Ej: Encuesta de satisfacción",
          },
        },
        label: {
          type: "plain_text",
          text: "¿Cuál es el título del formulario?",
        },
      },
      {
        type: "input",
        block_id: "form_description_input",
        element: {
          type: "plain_text_input",
          action_id: "form_description",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Ej: Esta encuesta nos ayudará a mejorar nuestros servicios",
          },
        },
        label: {
          type: "plain_text",
          text: "Proporciona una breve descripción del formulario",
        },
      },
      {
        type: "input",
        block_id: "form_submission_url_input",
        element: {
          type: "plain_text_input",
          action_id: "form_submission_url",
          placeholder: {
            type: "plain_text",
            text: "Ej: https://miapi.com/submit",
          },
        },
        label: {
          type: "plain_text",
          text: "Proporciona la URL para enviar los datos del formulario",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Continuar",
            },
            style: "primary",
            action_id: "continue_form_creation",
          },
        ],
      },
    ],
  });
});

// Manejar la continuación de la creación del formulario
app.action("continue_form_creation", async ({ body, ack, say }) => {
  await ack();
  tempForm.title = body.state.values.form_title_input.form_title.value;
  tempForm.description =
    body.state.values.form_description_input.form_description.value;
  tempForm.submissionUrl =
    body.state.values.form_submission_url_input.form_submission_url.value; // Guardar la URL de envío

  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Vamos a agregar campos al formulario. ¿Qué tipo de campo quieres agregar?",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "static_select",
            placeholder: {
              type: "plain_text",
              text: "Selecciona un tipo de campo",
            },
            options: [
              {
                text: {
                  type: "plain_text",
                  text: "Texto corto",
                },
                value: "short_text",
              },
              {
                text: {
                  type: "plain_text",
                  text: "Texto largo",
                },
                value: "long_text",
              },
              {
                text: {
                  type: "plain_text",
                  text: "Selección múltiple",
                },
                value: "multiple_choice",
              },
              {
                text: {
                  type: "plain_text",
                  text: "Casilla de verificación",
                },
                value: "checkbox",
              },
              {
                text: {
                  type: "plain_text",
                  text: "Fecha",
                },
                value: "date",
              },
            ],
            action_id: "field_type_select",
          },
        ],
      },
    ],
  });
});

// Manejar la selección del tipo de campo
app.action("field_type_select", async ({ body, ack, say }) => {
  await ack();
  const selectedType = body.actions[0].selected_option.value;

  tempForm.currentField = { type: selectedType };

  await say({
    blocks: [
      {
        type: "input",
        block_id: "field_name_input",
        element: {
          type: "plain_text_input",
          action_id: "field_name",
          placeholder: {
            type: "plain_text",
            text: "Ej: Nombre completo",
          },
        },
        label: {
          type: "plain_text",
          text: "¿Cuál es el nombre de este campo?",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Confirmar",
            },
            style: "primary",
            value: selectedType,
            action_id: "confirm_field",
          },
        ],
      },
    ],
  });
});

// Manejar la confirmación del campo
app.action("confirm_field", async ({ body, ack, say }) => {
  await ack();
  const fieldType = body.actions[0].value;
  const fieldName = body.state.values.field_name_input.field_name.value;

  tempForm.currentField.name = fieldName;

  if (fieldType === "multiple_choice") {
    await say({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Vamos a agregar opciones para el campo de selección múltiple "${fieldName}". ¿Cuál es la primera opción?`,
          },
        },
        {
          type: "input",
          block_id: "option_input",
          element: {
            type: "plain_text_input",
            action_id: "option_value",
            placeholder: {
              type: "plain_text",
              text: "Ej: Opción 1",
            },
          },
          label: {
            type: "plain_text",
            text: "Ingresa una opción",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Agregar opción",
              },
              style: "primary",
              action_id: "add_option",
            },
          ],
        },
      ],
    });
    tempForm.currentField.options = [];
  } else {
    // Guardar el campo en el formulario temporal
    tempForm.fields.push(tempForm.currentField);
    delete tempForm.currentField;

    await say(`Campo agregado: "${fieldName}" (Tipo: ${fieldType})`);
    await askForNextField(say);
  }
});

// Manejar la adición de opciones para selección múltiple
app.action("add_option", async ({ body, ack, say }) => {
  await ack();
  const optionValue = body.state.values.option_input.option_value.value;

  tempForm.currentField.options.push(optionValue);

  await say(`Opción agregada: "${optionValue}"`);
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "¿Quieres agregar otra opción?",
        },
      },
      {
        type: "input",
        block_id: "option_input",
        element: {
          type: "plain_text_input",
          action_id: "option_value",
          placeholder: {
            type: "plain_text",
            text: "Ej: Opción 2",
          },
        },
        label: {
          type: "plain_text",
          text: "Ingresa otra opción (o deja en blanco para terminar)",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Agregar opción",
            },
            style: "primary",
            action_id: "add_option",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Terminar opciones",
            },
            style: "danger",
            action_id: "finish_options",
          },
        ],
      },
    ],
  });
});

// Manejar la finalización de opciones para selección múltiple
app.action("finish_options", async ({ body, ack, say }) => {
  await ack();

  // Guardar el campo en el formulario temporal
  tempForm.fields.push(tempForm.currentField);
  delete tempForm.currentField;

  await say(
    `Campo de selección múltiple agregado con ${
      tempForm.fields[tempForm.fields.length - 1].options.length
    } opciones.`
  );
  await askForNextField(say);
});

// Función para preguntar por el siguiente campo
async function askForNextField(say) {
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "¿Quieres agregar otro campo al formulario?",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Sí, agregar otro campo",
            },
            style: "primary",
            action_id: "add_another_field",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "No, terminar formulario",
            },
            style: "danger",
            action_id: "finish_form",
          },
        ],
      },
    ],
  });
}

// Manejar la acción de agregar otro campo
app.action("add_another_field", async ({ ack, say }) => {
  await ack();
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "¿Qué tipo de campo quieres agregar ahora?",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "static_select",
            placeholder: {
              type: "plain_text",
              text: "Selecciona un tipo de campo",
            },
            options: [
              {
                text: {
                  type: "plain_text",
                  text: "Texto corto",
                },
                value: "short_text",
              },
              {
                text: {
                  type: "plain_text",
                  text: "Texto largo",
                },
                value: "long_text",
              },
              {
                text: {
                  type: "plain_text",
                  text: "Selección múltiple",
                },
                value: "multiple_choice",
              },
              {
                text: {
                  type: "plain_text",
                  text: "Casilla de verificación",
                },
                value: "checkbox",
              },
              {
                text: {
                  type: "plain_text",
                  text: "Fecha",
                },
                value: "date",
              },
            ],
            action_id: "field_type_select",
          },
        ],
      },
    ],
  });
});

// Manejar la acción de terminar el formulario
app.action("finish_form", async ({ ack, say }) => {
  await ack();

  // Guardar el formulario temporal en el objeto de formularios
  forms[tempForm.id] = tempForm;

  // Guardar el formulario en un archivo JSON
  const fs = require("fs");
  const path = require("path");
  const formFileName = `form_${tempForm.id}.json`;
  const formFilePath = path.join(__dirname, "forms", formFileName);

  try {
    // Asegurarse de que el directorio 'forms' existe
    if (!fs.existsSync(path.join(__dirname, "forms"))) {
      fs.mkdirSync(path.join(__dirname, "forms"));
    }

    // Escribir el formulario en el archivo JSON
    fs.writeFileSync(formFilePath, JSON.stringify(tempForm, null, 2));

    await say(
      `¡Formulario "${tempForm.title}" creado con éxito! Tiene ${tempForm.fields.length} campos. Se ha guardado en ${formFileName}. Puedes usar el comando /run-form para ejecutarlo.`
    );
  } catch (error) {
    console.error("Error al guardar el formulario:", error);
    await say(
      `¡Formulario "${tempForm.title}" creado con éxito! Tiene ${tempForm.fields.length} campos. Pero hubo un error al guardarlo en un archivo. Puedes usar el comando /run-form para ejecutarlo.`
    );
  }

  // Limpiar el objeto temporal
  tempForm = null;
});

// Comando para ver los formularios creados
app.command("/list-forms", async ({ command, ack, say }) => {
  await ack();

  const fs = require("fs");
  const path = require("path");
  const formsDir = path.join(__dirname, "forms");

  try {
    const files = fs.readdirSync(formsDir);
    const userForms = files
      .filter((file) => file.startsWith("form_") && file.endsWith(".json"))
      .map((file) => {
        const formData = JSON.parse(
          fs.readFileSync(path.join(formsDir, file), "utf8")
        );
        return formData;
      })
      .filter((form) => form.userId === command.user_id);

    if (userForms.length === 0) {
      await say(
        "No tienes ningún formulario creado. Usa /create-form para crear uno."
      );
      return;
    }

    const formList = userForms.map((form) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${form.title}*\nID: ${form.id}\nDescripción: ${form.description}\nCampos: ${form.fields.length}`,
      },
    }));

    await say({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Tus formularios creados:*",
          },
        },
        ...formList,
      ],
    });
  } catch (error) {
    console.error("Error al leer los formularios:", error);
    await say("Ocurrió un error al obtener la lista de formularios.");
  }
});

// Comando para ejecutar el formulario
app.command("/test-form", async ({ command, ack, say }) => {
  await ack();

  const fs = require("fs");
  const path = require("path");
  const formsDir = path.join(__dirname, "forms");

  try {
    const files = fs.readdirSync(formsDir);
    const userForms = files
      .filter((file) => file.startsWith("form_") && file.endsWith(".json"))
      .map((file) => {
        const formData = JSON.parse(
          fs.readFileSync(path.join(formsDir, file), "utf8")
        );
        return formData;
      })
      .filter((form) => form.userId === command.user_id);

    if (userForms.length === 0) {
      await say(
        "No tienes ningún formulario creado. Usa /create-form para crear uno."
      );
      return;
    }

    const formOptions = userForms.map((form) => ({
      text: {
        type: "plain_text",
        text: form.title,
      },
      value: form.id,
    }));

    await say({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Selecciona el formulario que quieres ejecutar:",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Selecciona un formulario",
              },
              options: formOptions,
              action_id: "select_form_to_run",
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error("Error al leer los formularios:", error);
    await say("Ocurrió un error al obtener la lista de formularios.");
  }
});

// Manejar la selección del formulario a ejecutar
app.action("select_form_to_run", async ({ body, ack, say }) => {
  await ack();
  const formId = body.actions[0].selected_option.value;

  const fs = require("fs");
  const path = require("path");
  const formPath = path.join(__dirname, "forms", `form_${formId}.json`);

  try {
    const formData = JSON.parse(fs.readFileSync(formPath, "utf8"));
    const selectedForm = formData;

    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${selectedForm.title}*\n${selectedForm.description}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*ID del formulario:* ${formId}`,
          },
        ],
      },
      ...selectedForm.fields.map((field) => {
        if (field.type === "multiple_choice") {
          return {
            type: "input",
            block_id: `${field.name.toLowerCase().replace(/ /g, "_")}_input`,
            element: {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Selecciona una opción",
              },
              options: field.options.map((option) => ({
                text: {
                  type: "plain_text",
                  text: option,
                },
                value: option.toLowerCase().replace(/ /g, "_"),
              })),
              action_id: field.name.toLowerCase().replace(/ /g, "_"),
            },
            label: {
              type: "plain_text",
              text: field.name,
            },
          };
        } else if (field.type === "date") {
          return {
            type: "input",
            block_id: `${field.name.toLowerCase().replace(/ /g, "_")}_input`,
            element: {
              type: "datepicker",
              action_id: field.name.toLowerCase().replace(/ /g, "_"),
              placeholder: {
                type: "plain_text",
                text: "Selecciona una fecha",
              },
            },
            label: {
              type: "plain_text",
              text: field.name,
            },
          };
        } else if (field.type === "checkbox") {
          return {
            type: "input",
            block_id: `${field.name.toLowerCase().replace(/ /g, "_")}_input`,
            element: {
              type: "checkboxes",
              action_id: field.name.toLowerCase().replace(/ /g, "_"),
              options: [
                {
                  text: {
                    type: "plain_text",
                    text: field.name,
                  },
                  value: "checked",
                },
              ],
            },
            label: {
              type: "plain_text",
              text: field.name,
            },
          };
        } else {
          return {
            type: "input",
            block_id: `${field.name.toLowerCase().replace(/ /g, "_")}_input`,
            element: {
              type:
                field.type === "long_text"
                  ? "plain_text_input"
                  : "plain_text_input",
              action_id: field.name.toLowerCase().replace(/ /g, "_"),
              multiline: field.type === "long_text",
            },
            label: {
              type: "plain_text",
              text: field.name,
            },
          };
        }
      }),
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Enviar",
            },
            style: "primary",
            action_id: "submit_form",
            value: formId, // Añadimos el ID del formulario como valor del botón
          },
        ],
      },
    ];

    await say({ blocks });
  } catch (error) {
    console.error("Error al leer el formulario:", error);
    await say("Ocurrió un error al cargar el formulario seleccionado.");
  }
});

// Manejar el envío del formulario
app.action("submit_form", async ({ body, ack, say }) => {
  await ack();

  const user = body.user;
  const userEmail = await getUserEmail(user.id);
  const formId = body.actions[0].value; // Obtenemos el ID del formulario del botón

  const fs = require("fs");
  const path = require("path");
  const formPath = path.join(__dirname, "forms", `form_${formId}.json`);

  try {
    const formData = JSON.parse(fs.readFileSync(formPath, "utf8"));
    const submissionUrl = formData.submissionUrl;

    const responses = Object.entries(body.state.values).map(
      ([blockId, block]) => {
        const fieldName = blockId.replace(/_input$/, "").replace(/_/g, " ");
        const fieldValue = Object.values(block)[0];

        // Manejar campos de selección múltiple, fecha y casilla de verificación
        if (fieldValue.type === "static_select") {
          return { [fieldName]: fieldValue.selected_option.text.text };
        } else if (fieldValue.type === "datepicker") {
          return { [fieldName]: fieldValue.selected_date };
        } else if (fieldValue.type === "checkboxes") {
          return {
            [fieldName]: fieldValue.selected_options.length > 0 ? "Sí" : "No",
          };
        } else {
          return { [fieldName]: fieldValue.value };
        }
      }
    );

    const userInfo = [
      { type: "mrkdwn", text: "*Usuario:*" },
      { type: "plain_text", text: user.name },
      { type: "mrkdwn", text: "*ID:*" },
      { type: "plain_text", text: user.id },
      { type: "mrkdwn", text: "*Email:*" },
      { type: "plain_text", text: userEmail || "No disponible" },
    ];

    const formattedResponses = responses
      .map((response) => {
        const [key, value] = Object.entries(response)[0];
        return [
          { type: "mrkdwn", text: `*${key}:*` },
          { type: "plain_text", text: value },
        ];
      })
      .flat();

    await say({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Formulario enviado con éxito*",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Información del usuario:*",
          },
        },
        {
          type: "section",
          fields: userInfo,
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Respuestas:*",
          },
        },
        {
          type: "section",
          fields: formattedResponses,
        },
      ],
    });

    const submissionData = Object.assign({}, ...responses);

    // agrega la info del usuario al objeto de envío
    submissionData.userName = user.name;
    submissionData.userEmail = userEmail;
    submissionData.userSlackId = user.id;

    try {
      await axios.post(submissionUrl, submissionData);
      await say("Formulario enviado con éxito a la URL de envío.");
    } catch (error) {
      console.error("Error al enviar los datos:", error);
      await say("Ocurrió un error al enviar los datos a la URL de envío.");
    }
  } catch (error) {
    console.error("Error al leer el formulario:", error);
    await say("Ocurrió un error al procesar el formulario.");
  }
});

// Función para obtener el email de un usuario basado en su ID de Slack
async function getUserEmail(userId) {
  try {
    // Utiliza el método users.info de la API de Slack para obtener información del usuario
    const result = await app.client.users.info({
      token: process.env.SLACK_BOT_TOKEN,
      user: userId,
    });

    // Verifica si la solicitud fue exitosa y si el usuario tiene un email
    if (
      result.ok &&
      result.user &&
      result.user.profile &&
      result.user.profile.email
    ) {
      return result.user.profile.email;
    } else {
      console.log(`No se pudo obtener el email para el usuario ${userId}`);
      return null;
    }
  } catch (error) {
    console.error(`Error al obtener el email del usuario ${userId}:`, error);
    return null;
  }
}

// Nuevo comando para ejecutar un formulario en un canal
app.command("/run-form-on-channel", async ({ command, ack, say }) => {
  await ack();

  const fs = require("fs");
  const path = require("path");
  const formsDir = path.join(__dirname, "forms");

  try {
    const files = fs.readdirSync(formsDir);
    const userForms = files
      .filter((file) => file.startsWith("form_") && file.endsWith(".json"))
      .map((file) => {
        const formData = JSON.parse(
          fs.readFileSync(path.join(formsDir, file), "utf8")
        );
        return formData;
      })
      .filter((form) => form.userId === command.user_id);

    if (userForms.length === 0) {
      await say(
        "No tienes ningún formulario creado. Usa /create-form para crear uno."
      );
      return;
    }

    // Obtener la lista de canales
    const result = await app.client.conversations.list({
      token: process.env.SLACK_BOT_TOKEN,
      types: "public_channel,private_channel",
    });

    const channelOptions = result.channels.map((channel) => ({
      text: {
        type: "plain_text",
        text: channel.name,
      },
      value: channel.id,
    }));

    const formOptions = userForms.map((form) => ({
      text: {
        type: "plain_text",
        text: form.title,
      },
      value: form.id,
    }));

    await say({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Selecciona el formulario que quieres ejecutar:",
          },
        },
        {
          type: "actions",
          block_id: "form_selection",
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Selecciona un formulario",
              },
              options: formOptions,
              action_id: "select_form_for_channel",
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Selecciona el canal donde quieres ejecutar el formulario:",
          },
        },
        {
          type: "actions",
          block_id: "channel_selection",
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Selecciona un canal",
              },
              options: channelOptions,
              action_id: "select_channel_for_form",
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error(error);
    await say("Ocurrió un error al obtener la lista de formularios o canales.");
  }
});

// Manejar la selección del formulario y canal
app.action("select_form_for_channel", async ({ body, ack, respond }) => {
  await ack();
  const formId = body.actions[0].selected_option.value;

  // Actualizar el mensaje con el formulario seleccionado
  await respond({
    response_type: "ephemeral",
    replace_original: false,
    text: `Formulario seleccionado: ${body.actions[0].selected_option.text.text}. Ahora selecciona un canal.`,
  });
});

app.action("select_channel_for_form", async ({ body, ack, respond }) => {
  await ack();
  const channelId = body.actions[0].selected_option.value;
  const formId =
    body.state.values.form_selection.select_form_for_channel.selected_option
      .value;

  if (!formId) {
    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: "Por favor, selecciona primero un formulario.",
    });
    return;
  }
  //
  const fs = require("fs");
  const path = require("path");
  const formPath = path.join(__dirname, "forms", `form_${formId}.json`);

  try {
    const formData = JSON.parse(fs.readFileSync(formPath, "utf8"));
    const selectedForm = formData;

    // Obtener la lista de miembros del canal
    const result = await app.client.conversations.members({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channelId,
    });

    let successCount = 0;
    let failedCount = 0;
    let errors = [];

    const message = await generateMessage(selectedForm);

    console.log(message);
    // Enviar el formulario a cada miembro del canal
    for (const memberId of result.members) {
      try {
        // Abrir un DM con el usuario
        const dm = await app.client.conversations.open({
          token: process.env.SLACK_BOT_TOKEN,
          users: memberId,
        });

        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: dm.channel.id,
          text: `<@${memberId}> ${message}`,
        });

        // Enviar el formulario al DM
        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: dm.channel.id,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${selectedForm.title}*\n${selectedForm.description}`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `*ID del formulario:* ${formId}`,
                },
              ],
            },
            ...selectedForm.fields.map((field) => {
              if (field.type === "multiple_choice") {
                return {
                  type: "input",
                  block_id: `${field.name
                    .toLowerCase()
                    .replace(/ /g, "_")}_input`,
                  element: {
                    type: "static_select",
                    placeholder: {
                      type: "plain_text",
                      text: "Selecciona una opción",
                    },
                    options: field.options.map((option) => ({
                      text: {
                        type: "plain_text",
                        text: option,
                      },
                      value: option.toLowerCase().replace(/ /g, "_"),
                    })),
                    action_id: field.name.toLowerCase().replace(/ /g, "_"),
                  },
                  label: {
                    type: "plain_text",
                    text: field.name,
                  },
                };
              } else if (field.type === "date") {
                return {
                  type: "input",
                  block_id: `${field.name
                    .toLowerCase()
                    .replace(/ /g, "_")}_input`,
                  element: {
                    type: "datepicker",
                    action_id: field.name.toLowerCase().replace(/ /g, "_"),
                    placeholder: {
                      type: "plain_text",
                      text: "Selecciona una fecha",
                    },
                  },
                  label: {
                    type: "plain_text",
                    text: field.name,
                  },
                };
              } else if (field.type === "checkbox") {
                return {
                  type: "input",
                  block_id: `${field.name
                    .toLowerCase()
                    .replace(/ /g, "_")}_input`,
                  element: {
                    type: "checkboxes",
                    action_id: field.name.toLowerCase().replace(/ /g, "_"),
                    options: [
                      {
                        text: {
                          type: "plain_text",
                          text: field.name,
                        },
                        value: "checked",
                      },
                    ],
                  },
                  label: {
                    type: "plain_text",
                    text: field.name,
                  },
                };
              } else {
                return {
                  type: "input",
                  block_id: `${field.name
                    .toLowerCase()
                    .replace(/ /g, "_")}_input`,
                  element: {
                    type:
                      field.type === "long_text"
                        ? "plain_text_input"
                        : "plain_text_input",
                    action_id: field.name.toLowerCase().replace(/ /g, "_"),
                    multiline: field.type === "long_text",
                  },
                  label: {
                    type: "plain_text",
                    text: field.name,
                  },
                };
              }
            }),
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "Enviar",
                  },
                  style: "primary",
                  action_id: "submit_form",
                  value: formId, // Añadimos el ID del formulario como valor del botón
                },
              ],
            },
          ],
        });
        successCount++;
      } catch (error) {
        console.error(
          `Error al enviar el formulario al usuario ${memberId}:`,
          error
        );
        failedCount++;
        errors.push({
          userEmail: await getUserEmail(memberId),
          userId: memberId,
          failureReason: error.message,
        });
      }
    }

    // Crear la tabla de estadísticas
    let statsBlocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Estadísticas de envío del formulario "${selectedForm.title}"*`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*Exitosos:*\n" + successCount,
          },
          {
            type: "mrkdwn",
            text: "*Fallidos:*\n" + failedCount,
          },
        ],
      },
      {
        type: "divider",
      },
    ];

    if (errors.length > 0) {
      statsBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Detalles de errores:*",
        },
      });

      errors.forEach((error) => {
        statsBlocks.push({
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Email:* ${error.userEmail}\n*ID:* ${error.userId}`,
            },
            {
              type: "mrkdwn",
              text: `*Razón:* ${error.failureReason}`,
            },
          ],
        });
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      blocks: statsBlocks,
    });
  } catch (error) {
    console.error(error);
    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: "Ocurrió un error al enviar el formulario a los miembros del canal.",
    });
  }
});

async function generateMessage(form) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const prompt = `
  Genera un mensaje corto y divertido para invitar a alguien a llenar un formulario con el título "${form.title}" y la descripción "${form.description}". El mensaje debe ser atractivo y motivar a la persona a completar el formulario.
  - retorna unicamente el mensaje, no comillas, ni nada por el estilo
  `;

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20240620",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  console.log(response);

  return response.content[0].text;
}

// Iniciar la app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ App de Slack está funcionando!");
})();

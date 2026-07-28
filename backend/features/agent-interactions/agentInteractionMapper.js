export function toAgentInteractionDto(interaction) {
  return {
    id: interaction.id,
    agentId: interaction.agentId,
    sequenceNumber: interaction.sequenceNumber,
    requestId: interaction.requestId,
    userMessage: interaction.userMessage,
    response: {
      actionType: interaction.response.actionType,
      text: interaction.response.text
    },
    createdAt: interaction.createdAt
  };
}

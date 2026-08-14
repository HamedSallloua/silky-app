export function formatPrice(amount) {
  return (
    Number(amount).toLocaleString('fr-FR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }) + ' TND'
  );
}

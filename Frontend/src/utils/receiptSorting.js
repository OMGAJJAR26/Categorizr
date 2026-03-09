export const sortReceipts = (receipts, sortConfig) => {
  const sortedReceipts = [...receipts];
  
  if (sortConfig.amount) {
    sortedReceipts.sort((a, b) => {
      const priceA = Number(a.purchasePrice) || 0;
      const priceB = Number(b.purchasePrice) || 0;
      return sortConfig.amount === "asc" ? priceA - priceB : priceB - priceA;
    });
  } else if (sortConfig.date) {
    sortedReceipts.sort((a, b) => {
      const dateA = a.product_date ? Number(a.product_date) : 0;
      const dateB = b.product_date ? Number(b.product_date) : 0;
      return sortConfig.date === "newest" ? dateB - dateA : dateA - dateB;
    });
  } else if (sortConfig.order) {
    sortedReceipts.sort((a, b) => {
      const nameA = a.storeName?.toLowerCase() || "";
      const nameB = b.storeName?.toLowerCase() || "";
      return sortConfig.order === "az" 
        ? nameA.localeCompare(nameB) 
        : nameB.localeCompare(nameA);
    });
  } else {
    // Default: newest first
    sortedReceipts.sort((a, b) => {
      const dateA = a.product_date ? Number(a.product_date) : 0;
      const dateB = b.product_date ? Number(b.product_date) : 0;
      return dateB - dateA;
    });
  }
  
  return sortedReceipts;
};

export const sortYears = (groupedReceipts, yearTotals, sortConfig) => {
  const years = Object.keys(groupedReceipts);
  
  if (sortConfig.date === "newest") {
    return years.sort((a, b) => b - a);
  } else if (sortConfig.date === "oldest") {
    return years.sort((a, b) => a - b);
  } else if (sortConfig.amount === "asc") {
    return years.sort((a, b) => yearTotals[a] - yearTotals[b]);
  } else if (sortConfig.amount === "desc") {
    return years.sort((a, b) => yearTotals[b] - yearTotals[a]);
  } else if (sortConfig.order === "az") {
    return years.sort((a, b) => a.localeCompare(b));
  } else if (sortConfig.order === "za") {
    return years.sort((a, b) => b.localeCompare(a));
  }
  
  // Default: newest year first
  return years.sort((a, b) => b - a);
};
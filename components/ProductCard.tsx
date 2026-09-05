import type { ProductCardData } from "@/lib/types";

function complianceLine(status: string): string {
  if (status === "Not Specified") {
    return "Compliance status not specified on ASC's page — status unknown, verify directly.";
  }
  return `Listed as "${status}" on ASC's page — verify on the linked page before purchase.`;
}

export default function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <div className="product-card">
      <div className="product-card-header">
        <h3>{product.name}</h3>
        <span className="badge">{product.category}</span>
      </div>

      <dl className="product-meta">
        <div>
          <dt>Panels</dt>
          <dd>{product.panels ?? "n/a"}</dd>
        </div>
        <div className="product-meta-wide">
          <dt>Screens for</dt>
          <dd>{product.drugsTested}</dd>
        </div>
      </dl>

      <p className="compliance-line">
        {complianceLine(product.complianceStatus)}{" "}
        <a href={product.url} target="_blank" rel="noopener noreferrer">
          Verify on ASC ↗
        </a>
      </p>

      <div className="price-ladder">
        <p className="price-ladder-label">
          Illustrative pricing (from public pages, may be stale — verify current pricing with ASC):
        </p>
        {product.quotedPrice && (
          <p className="quoted-price">
            {product.quotedPrice.belowMinimum
              ? `Requested quantity is below the lowest price break. Best available rate: `
              : `At your requested quantity: `}
            <strong>${product.quotedPrice.pricePerUnit.toFixed(2)} each</strong>{" "}
            (min qty {product.quotedPrice.quantity})
          </p>
        )}
        <ul className="tier-list">
          {product.priceTiers.map((t) => (
            <li key={t.min_qty}>
              {t.min_qty}+ &mdash; ${t.price_each.toFixed(2)} each
            </li>
          ))}
        </ul>
      </div>

      <div className="product-footer">
        {product.caseSize && <span>{product.caseSize}</span>}
        {product.unitsAvailable !== null && <span>{product.unitsAvailable} units available</span>}
        {product.offers.map((offer) => (
          <span key={offer} className="offer-badge">
            {offer}
          </span>
        ))}
      </div>

      <a className="product-link" href={product.url} target="_blank" rel="noopener noreferrer">
        View on americanscreeningcorp.com ↗
      </a>
    </div>
  );
}

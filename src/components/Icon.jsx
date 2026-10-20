import { assets } from '../assets.js';

export default function Icon({ name, size, className = '' }) {
  return <img className={`icon ${className}`} src={assets[name]} width={size} height={size} alt="" aria-hidden="true" draggable="false" />;
}

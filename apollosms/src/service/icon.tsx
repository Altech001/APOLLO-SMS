import React from "react";
import {
    FormIcon,
    TemplateIcon,
    AIIcon,
    SettingsIcon,
    ConnectorsIcon,
    type IconProps,
} from "@/constants/Icons";

/**
 * Registry of all available icon names.
 * Add new icons here to make them available via `<Icon name="..." />`.
 */
const ICON_MAP: Record<string, React.FC<IconProps>> = {
    form: FormIcon,
    template: TemplateIcon,
    ai: AIIcon,
    settings: SettingsIcon,
    connectors: ConnectorsIcon,
};

export type IconName = keyof typeof ICON_MAP;

interface IconComponentProps extends IconProps {
    /** The icon identifier (must match a key in ICON_MAP) */
    name: string;
}

/**
 * Render an icon by name with consistent sizing and styling.
 *
 * @example
 * ```tsx
 * <Icon name="form" size={20} className="text-blue-500" />
 * ```
 */
const Icon: React.FC<IconComponentProps> = ({ name, size = 20, className, ...rest }) => {
    const IconComponent = ICON_MAP[name];

    if (!IconComponent) {
        console.warn(`[Icon] Unknown icon name: "${name}"`);
        return null;
    }

    return <IconComponent size={size} className={className} {...rest} />;
};

export default Icon;

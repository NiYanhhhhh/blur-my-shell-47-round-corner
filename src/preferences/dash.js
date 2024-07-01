'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();


var Dash = GObject.registerClass({
    GTypeName: 'Dash',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'dash.ui'])}`,
    InternalChildren: [
        'blur',
        'customize',
        'static_blur',
        'corner_radius',
        'override_background',
        'style_dash_to_dock',
        'unblur_in_overview'
    ],
}, class Dash extends Adw.PreferencesPage {
    constructor(preferences) {
        super({});

        this.preferences = preferences;

        this.preferences.dash_to_dock.settings.bind(
            'blur', this._blur, 'state',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.preferences.dash_to_dock.settings.bind(
            'static-blur',
            this._static_blur, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.preferences.dash_to_dock.settings.bind(
            'corner-radius',
            this._corner_radius, 'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.preferences.dash_to_dock.settings.bind(
            'override-background',
            this._override_background, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.preferences.dash_to_dock.settings.bind(
            'style-dash-to-dock', this._style_dash_to_dock, 'selected',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.preferences.dash_to_dock.settings.bind(
            'unblur-in-overview', this._unblur_in_overview, 'state',
            Gio.SettingsBindFlags.DEFAULT
        );

        this._customize.connect_to(this.preferences.dash_to_dock, false);
    }
});

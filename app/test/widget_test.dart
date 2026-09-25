import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:botigg/src/theme/app_theme.dart';
import 'package:botigg/src/utils/format.dart';

void main() {
  testWidgets('tema oscuro funciona y renderiza widgets básicos', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: Column(
            children: const [
              Text('Hola'),
              FilledButton(onPressed: null, child: Text('Guardar')),
            ],
          ),
        ),
      ),
    );

    expect(find.text('Hola'), findsOneWidget);
    expect(find.text('Guardar'), findsOneWidget);
  });

  test('Fmt.number formatea magnitudes', () {
    expect(Fmt.number(999), '999');
    expect(Fmt.number(1500), '1.5K');
    expect(Fmt.number(2500000), '2.5M');
  });
}
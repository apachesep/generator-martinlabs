var mysql = require('mysql');
var yosay = require('yosay');
var chalk = require('chalk');

module.exports = {

	connect: function(main) {

		main.connection = mysql.createConnection({
		    user: main.props.user,
		    password: main.props.password,
		    database: "information_schema"
		});

		main.connection.connect();
	},

	readTables: function(main) {
		var done = main.async();

        main.connection.query(
            "SELECT "
            + "table_name, table_comment "
            + "FROM tables "
            + "WHERE table_schema = ? ",
            [main.props.database],
        function(err, results, fields) {
            if (err) {
                main.log(yosay(
                    chalk.bgYellowBright.black.bold('Could not connect to informed database. Is it running?')
                ));

                throw err;
            }

            if (!results || !results.length) {
                main.log(yosay(
                    chalk.bgYellowBright.black.bold('Could not read ' + main.props.database + ' database.')
                ));

                throw new Error();
            }

            main.props.tables = [];

            var alltables = false;
            if (main.props.crudTables.length == 0) {
                alltables = true;
            }

            for (var i in results) {
                if (alltables) {
                    main.props.crudTables.push(results[i].table_name);
                }

                main.props.tables.push({
                    name: results[i].table_name,
                    comment: results[i].table_comment,
                    inCrud: alltables || main.props.crudTables.indexOf(results[i].table_name) > -1
                });
            }

            done();
        });
	},

	readColumns: function(main) {
		var done = main.async();

        main.props.referencedTables = new Set();
        main.props.NtoNreferencedTables = {};

        var recursive = function(index) {
            var table = main.props.tables[index];

            main.connection.query(
                "SELECT "
                + "c.column_name, is_nullable, data_type, character_maximum_length, "
                + "column_key, c.ordinal_position, c.column_comment, extra, referenced_table_name "
                + "FROM columns c "
                + "LEFT JOIN key_column_usage k ON c.table_schema = k.table_schema "
                + "AND c.table_name = k.table_name AND c.column_name = k.column_name "
                + "AND referenced_table_name IS NOT NULL "
                + "WHERE c.table_schema = ? "
                + "AND c.table_name = ? ",
                [main.props.database, table.name],
            function(err, results, fields) {

                table.columns = results;

                //adding referencedtables (tables that are referenced in foreign keys)
                //and N-to-N tables

                var refs = [];
                for (var i in table.columns) {
                    var c = table.columns[i];
                    if (c.referenced_table_name) {

                        refs.push({
                            col: c,
                            ref: c.referenced_table_name
                        });

                        main.props.referencedTables.add(c.referenced_table_name);
                    }
                }

                if (table.columns.length == 2 && refs.length == 2) {
                    //is N to N when only have 2 fields and both are foreign keys
                    table.isNtoNtable = true;

                    //add in a map of [referenced table name ; N to N table, column, and other table name]
                    var r = refs[0];
                    if (!main.props.NtoNreferencedTables[r.ref]) {
                        main.props.NtoNreferencedTables[r.ref] = [];
                    }

                    main.props.NtoNreferencedTables[r.ref].push({
                        column: r.col,
                        NtoNtable: table,
                        otherTableName: refs[1].ref
                    });

                    var r = refs[1];
                    if (!main.props.NtoNreferencedTables[r.ref]) {
                        main.props.NtoNreferencedTables[r.ref] = [];
                    }

                    main.props.NtoNreferencedTables[r.ref].push({
                        column: r.col,
                        NtoNtable: table,
                        otherTableName: refs[0].ref
                    });
                    
                }

                //search in the next table
                if (index + 1 < main.props.tables.length) {
                    recursive(index + 1);
                } else {
                    done();
                }
            });
        };

        recursive(0);
	}

};